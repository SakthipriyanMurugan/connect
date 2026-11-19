import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from anyio import to_thread
from app.core.config import settings
import logging

logger = logging.getLogger(__name__)

def _send_email_sync(to_email: str, subject: str, html_content: str) -> bool:
    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = f"{settings.FROM_NAME} <{settings.FROM_EMAIL}>"
        msg["To"] = to_email

        part = MIMEText(html_content, "html")
        msg.attach(part)

        with smtplib.SMTP(settings.SMTP_SERVER, settings.SMTP_PORT, timeout=15) as server:
            server.starttls()
            server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
            server.sendmail(settings.FROM_EMAIL, to_email, msg.as_string())
        
        logger.info(f"OTP email sent successfully to {to_email}")
        return True
    except Exception as e:
        logger.error(f"Failed to send email to {to_email}: {e}")
        return False

async def send_otp_email(to_email: str, otp_code: str, purpose: str = "account verification") -> bool:
    subject = f"{otp_code} is your VERTEX CONNECT verification code"
    
    html = f"""
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body {{
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
          background-color: #0b0e26;
          color: #f3f4ff;
          margin: 0;
          padding: 30px;
        }}
        .container {{
          max-width: 520px;
          margin: auto;
          background: linear-gradient(135deg, #181d45 0%, #101435 100%);
          border: 1px solid rgba(255, 255, 255, 0.15);
          border-radius: 20px;
          padding: 36px;
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
          text-align: center;
        }}
        .logo {{
          display: inline-block;
          width: 44px;
          height: 44px;
          line-height: 44px;
          border-radius: 12px;
          background: linear-gradient(145deg, #8cf4ff, #8d8cff, #d6a2ff);
          color: #171a42;
          font-size: 24px;
          font-weight: 900;
          margin-bottom: 12px;
        }}
        .brand-name {{
          font-size: 15px;
          font-weight: 800;
          letter-spacing: 1.5px;
          color: #8ce7f2;
          margin-bottom: 24px;
        }}
        h1 {{
          font-size: 24px;
          font-weight: 800;
          color: #ffffff;
          margin-top: 0;
          margin-bottom: 8px;
        }}
        p {{
          font-size: 13px;
          color: #a3abd0;
          line-height: 1.6;
          margin-bottom: 24px;
        }}
        .otp-box {{
          display: inline-block;
          background: rgba(255, 255, 255, 0.08);
          border: 1px solid rgba(166, 154, 255, 0.5);
          border-radius: 14px;
          padding: 16px 36px;
          font-size: 32px;
          font-weight: 900;
          letter-spacing: 8px;
          color: #8df0d4;
          box-shadow: 0 8px 24px rgba(141, 240, 212, 0.15);
          margin-bottom: 24px;
        }}
        .footer {{
          font-size: 11px;
          color: #7f89b1;
          border-top: 1px solid rgba(255, 255, 255, 0.1);
          padding-top: 18px;
          margin-top: 10px;
        }}
      </style>
    </head>
    <body>
      <div class="container">
        <div class="logo">V</div>
        <div class="brand-name">VERTEX CONNECT</div>
        <h1>Security Verification Code</h1>
        <p>Use the 6-digit code below to complete your {purpose}. This code is valid for <strong>10 minutes</strong>.</p>
        
        <div class="otp-box">{otp_code}</div>
        
        <p>If you did not request this verification code, you can safely ignore this email.</p>
        
        <div class="footer">
          JM Vertex Technologies · VERTEX CONNECT Secure Access<br>
          Private by design · Built for focus
        </div>
      </div>
    </body>
    </html>
    """
    
    return await to_thread.run_sync(_send_email_sync, to_email, subject, html)
