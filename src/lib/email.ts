import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT || "587"),
  secure: parseInt(process.env.SMTP_PORT || "587") === 465, // true for 465, false for other ports
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

const fromEmail = process.env.FROM_EMAIL || process.env.SMTP_USER;

export async function sendOtpEmail(to: string, otp: string, name: string) {
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h2 style="color: #333;">Password Reset</h2>
      <p>Hi ${name},</p>
      <p>You recently requested to reset your password for your Xine Analytics account. Use the OTP below to reset it. <strong>This OTP is valid for 10 minutes.</strong></p>
      <div style="background-color: #f4f4f4; padding: 15px; border-radius: 5px; text-align: center; margin: 20px 0;">
        <span style="font-size: 24px; font-weight: bold; letter-spacing: 5px; color: #000;">${otp}</span>
      </div>
      <p>If you did not request a password reset, please ignore this email or reply to let us know.</p>
      <p>Thanks,<br>The Xine Team</p>
    </div>
  `;

  await transporter.sendMail({
    from: `"Xine Analytics" <${fromEmail}>`,
    to,
    subject: "Xine Analytics - Password Reset OTP",
    html,
  });
}

export async function sendWelcomeEmail(to: string, name: string) {
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h2 style="color: #333;">Welcome to Xine Analytics</h2>
      <p>Hi ${name},</p>
      <p>You have been invited to access a Xine Analytics property. Please log in to view your dashboard.</p>
      <p>Thanks,<br>The Xine Team</p>
    </div>
  `;

  await transporter.sendMail({
    from: `"Xine Analytics" <${fromEmail}>`,
    to,
    subject: "Welcome to Xine Analytics",
    html,
  });
}

export async function sendInviteEmail(
  toEmail: string,
  token: string,
  siteName: string,
  inviterName: string
) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const registerUrl = `${appUrl}/register?token=${token}&email=${encodeURIComponent(
    toEmail
  )}`;

  const subject = `You've been invited to access ${siteName} on Xine Analytics`;
  
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h2>Welcome to Xine Analytics!</h2>
      <p>Hello,</p>
      <p><strong>${inviterName}</strong> has invited you to access the analytics dashboard for <strong>${siteName}</strong>.</p>
      <p>To accept this invitation and create your account, please click the button below:</p>
      <div style="margin: 30px 0;">
        <a href="${registerUrl}" style="background-color: #000; color: #fff; padding: 12px 24px; text-decoration: none; border-radius: 4px; font-weight: bold;">
          Accept Invitation & Register
        </a>
      </div>
      <p>If the button doesn't work, you can copy and paste this link into your browser:</p>
      <p style="word-break: break-all; color: #666;">
        <a href="${registerUrl}">${registerUrl}</a>
      </p>
      <p>Best regards,<br>The Xine Team</p>
    </div>
  `;

  await transporter.sendMail({
    from: `"Xine Analytics" <${fromEmail}>`,
    to: toEmail,
    subject,
    html,
  });
}
