import os
import sendgrid
from sendgrid.helpers.mail import Mail, Email, To, Content
from dotenv import load_dotenv

load_dotenv()

FROM_EMAIL = "connect@techdensolutions.com"
FROM_NAME = "TechDen Solutions"


async def send_email(to: str, subject: str, html: str):
    sg = sendgrid.SendGridAPIClient(api_key=os.getenv("SENDGRID_API_KEY"))
    message = Mail(
        from_email=(FROM_EMAIL, FROM_NAME),
        to_emails=to,
        subject=subject,
        html_content=html,
    )
    sg.send(message)
