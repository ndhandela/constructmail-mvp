
// ── Clash Assignments ─────────────────────────────────────────────────────────

// Get assignments for a project
app.get('/api/clash/assignments', async (req, res) => {
  try {
    const { userId, projectKey } = req.query;
    if (!userId || !projectKey) return res.status(400).json({ error: 'userId and projectKey required' });
    const result = await pool.query(
      'SELECT * FROM clash_assignments WHERE user_id = $1 AND project_key = $2',
      [userId, projectKey]
    );
    res.json({ assignments: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Save/update a single assignment
app.post('/api/clash/assignments', async (req, res) => {
  try {
    const { userId, projectKey, clashName, assignedTo, discipline, notes, status } = req.body;
    if (!userId || !projectKey || !clashName) {
      return res.status(400).json({ error: 'userId, projectKey and clashName required' });
    }
    const result = await pool.query(
      `INSERT INTO clash_assignments (user_id, project_key, clash_name, assigned_to, discipline, notes, status, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
       ON CONFLICT (user_id, project_key, clash_name)
       DO UPDATE SET assigned_to = $4, discipline = $5, notes = $6, status = $7, updated_at = NOW()
       RETURNING *`,
      [userId, projectKey, clashName, assignedTo || null, discipline || null, notes || null, status || 'open']
    );
    res.json({ assignment: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Generate coordination meeting agenda PDF
app.post('/api/clash/agenda-pdf', async (req, res) => {
  try {
    const { userId, projectKey, testName, fileName, clashes, assignments } = req.body;

    const PDFDocument = require('pdfkit');
    const doc = new PDFDocument({ margin: 50, size: 'A4' });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="POMAR-Clash-Agenda-${Date.now()}.pdf"`);
    doc.pipe(res);

    // ── Header ──
    doc.rect(0, 0, doc.page.width, 80).fill('#0E1B2C');
    doc.fillColor('white')
       .fontSize(20).font('Helvetica-Bold')
       .text('POMAR Clash', 50, 20);
    doc.fontSize(10).font('Helvetica')
       .text('BIM Coordination Meeting Agenda', 50, 45);
    doc.fontSize(9)
       .text(`Generated: ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`, 50, 60);

    doc.moveDown(3);

    // ── Project info ──
    doc.fillColor('#0E1B2C').fontSize(14).font('Helvetica-Bold')
       .text(testName || 'Clash Test', 50, 100);
    doc.fontSize(9).font('Helvetica').fillColor('#475569')
       .text(fileName, 50, 118);

    // ── Summary stats ──
    const assignmentMap = {};
    assignments.forEach(a => { assignmentMap[a.clash_name] = a; });

    const assigned   = clashes.filter(c => assignmentMap[c.name]?.assigned_to);
    const unassigned = clashes.filter(c => !assignmentMap[c.name]?.assigned_to);
    const critical   = clashes.filter(c => Math.abs(c.distance) >= 0.5);
    const high       = clashes.filter(c => { const d = Math.abs(c.distance); return d >= 0.2 && d < 0.5; });

    doc.moveDown(2);
    doc.rect(50, doc.y, doc.page.width - 100, 60).fill('#FAF7F2');
    const statsY = doc.y + 10;
    doc.fillColor('#0E1B2C').fontSize(9).font('Helvetica-Bold');
    doc.text(`Total: ${clashes.length}`, 70, statsY);
    doc.text(`Critical: ${critical.length}`, 160, statsY);
    doc.text(`High: ${high.length}`, 240, statsY);
    doc.text(`Assigned: ${assigned.length}`, 310, statsY);
    doc.text(`Unassigned: ${unassigned.length}`, 400, statsY);

    doc.moveDown(4);

    // ── Group by discipline ──
    const disciplines = {};
    clashes.forEach(clash => {
      const assignment = assignmentMap[clash.name];
      const disc = assignment?.discipline || assignment?.assigned_to || 'Unassigned';
      if (!disciplines[disc]) disciplines[disc] = [];
      disciplines[disc].push({ clash, assignment });
    });

    const SEVERITY_COLORS = {
      Critical: '#DC2626',
      High:     '#D97706',
      Medium:   '#2563EB',
      Low:      '#475569',
    };

    const getSeverityLabel = (distance) => {
      const d = Math.abs(distance);
      if (d >= 0.5)  return 'Critical';
      if (d >= 0.2)  return 'High';
      if (d >= 0.05) return 'Medium';
      return 'Low';
    };

    Object.entries(disciplines).forEach(([discipline, items]) => {
      // Section header
      if (doc.y > doc.page.height - 150) doc.addPage();

      doc.rect(50, doc.y, doc.page.width - 100, 24).fill('#0E1B2C');
      doc.fillColor('white').fontSize(10).font('Helvetica-Bold')
         .text(discipline, 60, doc.y - 18);
      doc.fillColor('#475569').fontSize(8).font('Helvetica')
         .text(`${items.length} clash${items.length !== 1 ? 'es' : ''}`, doc.page.width - 120, doc.y - 16);

      doc.moveDown(1.5);

      // Table header
      const tableTop = doc.y;
      doc.fontSize(7).font('Helvetica-Bold').fillColor('#475569');
      doc.text('CLASH',      60,  tableTop);
      doc.text('SEVERITY',   130, tableTop);
      doc.text('ELEMENT 1',  200, tableTop);
      doc.text('ELEMENT 2',  320, tableTop);
      doc.text('PENETRATION',430, tableTop);
      doc.text('NOTES',      490, tableTop);

      doc.moveTo(50, doc.y + 8).lineTo(doc.page.width - 50, doc.y + 8)
         .strokeColor('#E2E8F0').stroke();

      doc.moveDown(1);

      items.forEach(({ clash, assignment }, idx) => {
        if (doc.y > doc.page.height - 80) doc.addPage();

        const rowY = doc.y;
        const bg = idx % 2 === 0 ? '#FFFFFF' : '#F8FAFC';
        doc.rect(50, rowY - 2, doc.page.width - 100, 18).fill(bg);

        const sevLabel = getSeverityLabel(clash.distance);
        const sevColor = SEVERITY_COLORS[sevLabel];

        doc.fontSize(7).font('Helvetica').fillColor('#0E1B2C')
           .text(clash.name,                                    60,  rowY, { width: 60 });
        doc.fillColor(sevColor).font('Helvetica-Bold')
           .text(sevLabel,                                      130, rowY, { width: 60 });
        doc.fillColor('#0E1B2C').font('Helvetica')
           .text(clash.item1?.itemName || '',                   200, rowY, { width: 110 });
        doc.text(clash.item2?.itemName || '',                   320, rowY, { width: 100 });
        doc.fillColor(sevColor).font('Helvetica-Bold')
           .text(clash.distanceRaw || '',                       430, rowY, { width: 50 });
        doc.fillColor('#475569').font('Helvetica')
           .text(assignment?.notes || '',                       490, rowY, { width: 80 });

        doc.moveDown(1.2);
      });

      doc.moveDown(1.5);
    });

    // ── Footer ──
    const pageCount = doc.bufferedPageRange().count;
    for (let i = 0; i < pageCount; i++) {
      doc.switchToPage(i);
      doc.fontSize(7).fillColor('#475569').font('Helvetica')
         .text(
           `POMAR Clash · TechDen Solutions · pomar.ai · Page ${i + 1} of ${pageCount}`,
           50, doc.page.height - 30,
           { align: 'center', width: doc.page.width - 100 }
         );
    }

    doc.end();
  } catch (err) {
    console.error('PDF generation error:', err);
    res.status(500).json({ error: err.message });
  }
});
