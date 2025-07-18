const parseIntWithDefault = (envVar, defaultValue) =>
  parseInt(envVar) || defaultValue;

const config = {
  enabled: process.env.EMAIL_ENABLED === "true",

  smtp: {
    host: process.env.SMTP_HOST,
    port: parseIntWithDefault(process.env.SMTP_PORT, 587),
    secure: process.env.SMTP_SECURE === "true",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  },

  from: process.env.EMAIL_FROM,
  to: process.env.EMAIL_TO,
  cc: process.env.EMAIL_CC,
  attachReports: process.env.EMAIL_ATTACH_REPORTS !== "false",
  maxAttachmentSize: parseIntWithDefault(
    process.env.EMAIL_MAX_ATTACHMENT_SIZE,
    25 * 1024 * 1024
  ),
};

export default config;
