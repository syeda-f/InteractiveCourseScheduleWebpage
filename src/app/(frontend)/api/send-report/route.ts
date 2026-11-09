type ReportEmail = {
  course?: string
  to: string[]
  cc: string[]
  subject: string
  body: string
}

const isEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)

export async function POST(request: Request) {
  const token = process.env.MICROSOFT_GRAPH_ACCESS_TOKEN
  if (!token) return Response.json({ error: "Microsoft Graph is not configured." }, { status: 503 })

  let input: unknown
  try {
    input = await request.json()
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 })
  }

  const messages = typeof input === "object" && input !== null && Array.isArray((input as { messages?: unknown }).messages)
    ? (input as { messages: unknown[] }).messages
    : []
  if (!messages.length || messages.length > 50) {
    return Response.json({ error: "Select between 1 and 50 course reports." }, { status: 400 })
  }

  const validated: ReportEmail[] = []
  for (const message of messages) {
    if (typeof message !== "object" || message === null) {
      return Response.json({ error: "Invalid email payload." }, { status: 400 })
    }
    const candidate = message as Partial<ReportEmail>
    const to = Array.isArray(candidate.to) ? candidate.to.filter((value): value is string => typeof value === "string" && isEmail(value)).slice(0, 20) : []
    const cc = Array.isArray(candidate.cc) ? candidate.cc.filter((value): value is string => typeof value === "string" && isEmail(value)).slice(0, 20) : []
    const subject = typeof candidate.subject === "string" ? candidate.subject.trim().slice(0, 180) : ""
    const body = typeof candidate.body === "string" ? candidate.body.trim().slice(0, 30000) : ""
    if (!to.length || !subject || !body) {
      return Response.json({ error: "Every email needs a recipient, subject, and report summary." }, { status: 400 })
    }
    validated.push({ course: typeof candidate.course === "string" ? candidate.course.slice(0, 40) : undefined, to, cc, subject, body })
  }

  for (const message of validated) {
    const response = await fetch("https://graph.microsoft.com/v1.0/me/sendMail", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: {
          subject: message.subject,
          body: { contentType: "Text", content: message.body },
          toRecipients: message.to.map((address) => ({ emailAddress: { address } })),
          ccRecipients: message.cc.map((address) => ({ emailAddress: { address } })),
          attachments: [{
            "@odata.type": "#microsoft.graph.fileAttachment",
            name: `${(message.course ?? "course").replace(/[^a-z0-9-]+/gi, "_")}_grade_report.txt`,
            contentType: "text/plain",
            contentBytes: Buffer.from(message.body, "utf8").toString("base64"),
          }],
        },
        saveToSentItems: true,
      }),
    })
    if (!response.ok) {
      return Response.json({ error: "Outlook rejected one or more report emails." }, { status: 502 })
    }
  }

  return Response.json({ sent: validated.length })
}
