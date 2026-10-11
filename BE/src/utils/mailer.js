// No mail server is configured yet, so messages are printed to the server log instead of being sent.
// Replace the body of this function with a real mail client (SMTP, SES, ...) before going live.
export async function sendMail({ to, subject, text }) {
  console.log(`[mail] To: ${to}\n[mail] Subject: ${subject}\n[mail] ${text.replace(/\n/g, '\n[mail] ')}`)
}
