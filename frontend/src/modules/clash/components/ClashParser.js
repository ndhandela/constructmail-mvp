export function parseNavisworksHTML(htmlString) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlString, 'text/html');

  const result = {
    testName: '',
    summary: {
      tolerance: '',
      total: 0,
      New: 0,
      Active: 0,
      Reviewed: 0,
      Approved: 0,
      Resolved: 0,
      type: '',
      status: '',
    },
    clashes: [],
    parseErrors: [],
  };

  const animationDiv = doc.querySelector('div.animation');
  if (!animationDiv) {
    result.parseErrors.push('Could not find summary block. Is this a Navisworks HTML clash report?');
    return result;
  }

  const h3 = animationDiv.querySelector('h3');
  result.testName = h3 ? h3.textContent.trim() : 'Clash Test';

  animationDiv.querySelectorAll(':scope > span.namevaluepair').forEach((pair) => {
    const name = pair.querySelector('span.name')?.textContent?.trim();
    const value = pair.querySelector('span.value')?.textContent?.trim();
    if (!name) return;
    switch (name) {
      case 'Tolerance': result.summary.tolerance = value; break;
      case 'Total':     result.summary.total     = parseInt(value, 10) || 0; break;
      case 'New':       result.summary.New        = parseInt(value, 10) || 0; break;
      case 'Active':    result.summary.Active     = parseInt(value, 10) || 0; break;
      case 'Reviewed':  result.summary.Reviewed   = parseInt(value, 10) || 0; break;
      case 'Approved':  result.summary.Approved   = parseInt(value, 10) || 0; break;
      case 'Resolved':  result.summary.Resolved   = parseInt(value, 10) || 0; break;
      case 'Type':      result.summary.type       = value; break;
      case 'Status':    result.summary.status     = value; break;
      default: break;
    }
  });

  const viewpoints = doc.querySelectorAll('div.viewpoint');

  viewpoints.forEach((vp, idx) => {
    try {
      const clash = {
        id: idx + 1,
        name: '',
        distance: 0,
        distanceRaw: '',
        description: '',
        status: '',
        clashPoint: { x: null, y: null, z: null },
        gridLocation: '',
        dateCreated: '',
        item1: { elementId: '', layer: '', itemName: '', itemType: '' },
        item2: { elementId: '', layer: '', itemName: '', itemType: '' },
      };

      const getValue = (label) => {
        const pairs = vp.querySelectorAll('span.namevaluepair');
        for (const pair of pairs) {
          const n = pair.querySelector('span.name')?.textContent?.trim();
          if (n === label) {
            return pair.querySelector('span.value')?.textContent?.trim() || '';
          }
        }
        return '';
      };

      clash.name         = getValue('Name');
      clash.distanceRaw  = getValue('Distance');
      clash.description  = getValue('Description');
      clash.status       = getValue('Status');
      clash.gridLocation = getValue('Grid Location');
      clash.dateCreated  = getValue('Date Created').replace(/\s+/g, ' ').trim();
      clash.distance     = parseFloat(clash.distanceRaw.replace('m', '')) || 0;

      const cpRaw = getValue('Clash Point');
      if (cpRaw) {
        const coords = cpRaw.split(',').map((s) => parseFloat(s.trim()));
        if (coords.length >= 3) {
          clash.clashPoint = { x: coords[0], y: coords[1], z: coords[2] };
        }
      }

      const itemHeaders = vp.querySelectorAll('h4.clashobject');

      const parseItem = (h4) => {
        const item = { elementId: '', layer: '', itemName: '', itemType: '' };
        if (!h4) return item;
        let sibling = h4.nextElementSibling;
        while (sibling && sibling.tagName !== 'H4') {
          if (sibling.classList.contains('namevaluepair')) {
            const n = sibling.querySelector('span.name')?.textContent?.trim();
            const v = sibling.querySelector('span.value')?.textContent?.trim() || '';
            if (n === 'Element ID') item.elementId = v;
            if (n === 'Layer')      item.layer     = v;
            if (n === 'Item Name')  item.itemName  = v;
            if (n === 'Item Type')  item.itemType  = v;
          }
          sibling = sibling.nextElementSibling;
        }
        return item;
      };

      clash.item1 = parseItem(itemHeaders[0]);
      clash.item2 = parseItem(itemHeaders[1]);

      result.clashes.push(clash);
    } catch (err) {
      result.parseErrors.push(`Clash #${idx + 1}: ${err.message}`);
    }
  });

  return result;
}

export function getSeverity(distance) {
  const depth = Math.abs(distance);
  if (depth >= 0.5)  return { label: 'Critical', color: '#DC2626', bgColor: '#FEF2F2', barWidth: 100, priority: 1 };
  if (depth >= 0.2)  return { label: 'High',     color: '#D97706', bgColor: '#FFFBEB', barWidth: 70,  priority: 2 };
  if (depth >= 0.05) return { label: 'Medium',   color: '#2563EB', bgColor: '#EFF6FF', barWidth: 40,  priority: 3 };
  return               { label: 'Low',            color: '#475569', bgColor: '#F8FAFC', barWidth: 15,  priority: 4 };
}

export function getStatusStyle(status) {
  const map = {
    New:      { bg: '#EFF6FF', text: '#1D4ED8' },
    Active:   { bg: '#FEF2F2', text: '#DC2626' },
    Reviewed: { bg: '#FFFBEB', text: '#92400E' },
    Approved: { bg: '#F0FDF4', text: '#166534' },
    Resolved: { bg: '#F8FAFC', text: '#475569' },
  };
  return map[status] || { bg: '#F1F5F9', text: '#334155' };
}

export function getTopPairs(clashes, topN = 5) {
  const counts = {};
  clashes.forEach((c) => {
    const key = [c.item1.itemName, c.item2.itemName].sort().join(' ↔ ');
    counts[key] = (counts[key] || 0) + 1;
  });
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, topN);
  const max = sorted[0]?.[1] || 1;
  return sorted.map(([pair, count]) => ({ pair, count, pct: Math.round((count / max) * 100) }));
}

export function getUniqueLayers(clashes) {
  const set = new Set();
  clashes.forEach((c) => {
    if (c.item1.layer) set.add(c.item1.layer);
    if (c.item2.layer) set.add(c.item2.layer);
  });
  return [...set].sort();
}
