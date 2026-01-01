require("dotenv").config();
const express = require("express");
const multer = require("multer");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const axios = require("axios");
const mammoth = require("mammoth");
const pdfParse = require("pdf-parse");
const PDFDocument = require("pdfkit");
const {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  BorderStyle,
} = require("docx");

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static("public"));

// Create necessary directories
const uploadsDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

// Configure multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  },
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = ["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error("Invalid file type. Only PDF and DOCX files are allowed."), false);
  }
};

const upload = multer({ storage, fileFilter, limits: { fileSize: 10 * 1024 * 1024 } });

// Parse CV content
async function parseCVContent(filePath, mimeType) {
  const buffer = fs.readFileSync(filePath);
  if (mimeType === "application/pdf") {
    const data = await pdfParse(buffer);
    return data.text;
  } else {
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  }
}

// DeepSeek API call
async function callDeepSeek(systemPrompt, userPrompt, maxTokens = 4000) {
  const response = await axios.post(
    "https://api.deepseek.com/chat/completions",
    {
      model: "deepseek-chat",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.5,
      max_tokens: maxTokens,
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
        "Content-Type": "application/json",
      },
    }
  );
  return response.data.choices[0].message.content;
}

// Generate tailored CV - returns structured JSON
async function generateTailoredCV(cvContent, jobDescription) {
  const prompt = `You are a professional CV writer. Analyze the original CV and tailor it for the target job.

ORIGINAL CV:
${cvContent}

TARGET JOB DESCRIPTION:
${jobDescription}

INSTRUCTIONS:
1. Extract candidate's EXACT name, email, phone, location from CV
2. Create professional summary (3-4 sentences)
3. Rewrite bullet points for experience to match target job
4. List relevant skills
5. Include EXACT education details

OUTPUT FORMAT (JSON):
{
  "personalInfo": { "fullName": "...", "email": "...", "phone": "...", "location": "...", "linkedin": "..." },
  "summary": "...",
  "experience": [ { "title": "...", "company": "...", "location": "...", "dates": "...", "achievements": ["..."] } ],
  "skills": ["..."],
  "education": [ { "degree": "...", "institution": "...", "dates": "...", "details": "..." } ]
}

Return ONLY valid JSON.`;

  return await callDeepSeek("You are an expert CV writer. Always output JSON.", prompt, 4000);
}

async function generateCoverLetter(cvContent, jobDescription, candidateName) {
  const prompt = `Write a professional cover letter for ${candidateName} for this job:\n${jobDescription}\nOriginal CV Context:\n${cvContent}`;
  return await callDeepSeek("You write professional cover letters without placeholders or asterisks.", prompt, 2048);
}

async function generateApplicationEmail(cvContent, jobDescription, candidateName) {
  const prompt = `Write a professional application email for ${candidateName} for this job:\n${jobDescription}`;
  return await callDeepSeek("You write professional job application emails without placeholders or asterisks.", prompt, 1024);
}

// DOCX Generators
async function generateCVDocx(cvData) {
  const children = [
    new Paragraph({
      children: [
        new TextRun({
          text: cvData.personalInfo.fullName.toUpperCase(),
          bold: true,
          size: 40,
          font: "Calibri",
          color: "1a365d",
        }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { after: 120 },
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: `${cvData.personalInfo.email} | ${cvData.personalInfo.phone} | ${cvData.personalInfo.location}`,
          size: 20,
          font: "Calibri",
          color: "4a5568",
        }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { after: 300 },
    }),
    // Horizontal divider
    new Paragraph({
      border: {
        bottom: { color: "1a365d", space: 1, style: BorderStyle.SINGLE, size: 12 },
      },
      spacing: { after: 300 },
    })
  ];

  // Professional Summary
  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: "PROFESSIONAL SUMMARY",
          bold: true,
          size: 24,
          font: "Calibri",
          color: "1a365d",
        }),
      ],
      spacing: { before: 200, after: 120 },
      border: {
        bottom: { color: "e2e8f0", space: 1, style: BorderStyle.SINGLE, size: 6 },
      },
    }),
    new Paragraph({
      children: [new TextRun({ text: cvData.summary, size: 22, font: "Calibri" })],
      spacing: { after: 200 },
    })
  );

  // Experience
  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: "PROFESSIONAL EXPERIENCE",
          bold: true,
          size: 24,
          font: "Calibri",
          color: "1a365d",
        }),
      ],
      spacing: { before: 200, after: 120 },
      border: {
        bottom: { color: "e2e8f0", space: 1, style: BorderStyle.SINGLE, size: 6 },
      },
    })
  );

  for (const job of cvData.experience) {
    children.push(
      new Paragraph({
        children: [
          new TextRun({ text: job.title, bold: true, size: 22, font: "Calibri" }),
          new TextRun({ text: "  |  ", size: 22, font: "Calibri", color: "a0aec0" }),
          new TextRun({ text: job.company, size: 22, font: "Calibri", italics: true }),
        ],
        spacing: { before: 150, after: 60 },
      }),
      new Paragraph({
        children: [
          new TextRun({
            text: `${job.location} | ${job.dates}`,
            size: 20,
            font: "Calibri",
            color: "718096",
          }),
        ],
        spacing: { after: 80 },
      })
    );
    for (const ach of job.achievements) {
      children.push(
        new Paragraph({
          children: [new TextRun({ text: "• " + ach, size: 21, font: "Calibri" })],
          spacing: { after: 60 },
          indent: { left: 360 },
        })
      );
    }
  }

  // Skills
  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: "SKILLS",
          bold: true,
          size: 24,
          font: "Calibri",
          color: "1a365d",
        }),
      ],
      spacing: { before: 200, after: 120 },
      border: {
        bottom: { color: "e2e8f0", space: 1, style: BorderStyle.SINGLE, size: 6 },
      },
    }),
    new Paragraph({
      children: [new TextRun({ text: cvData.skills.join("  •  "), size: 21, font: "Calibri" })],
      spacing: { after: 200 },
    })
  );

  // Education
  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: "EDUCATION",
          bold: true,
          size: 24,
          font: "Calibri",
          color: "1a365d",
        }),
      ],
      spacing: { before: 200, after: 120 },
      border: {
        bottom: { color: "e2e8f0", space: 1, style: BorderStyle.SINGLE, size: 6 },
      },
    })
  );

  for (const edu of cvData.education) {
    children.push(
      new Paragraph({
        children: [new TextRun({ text: edu.degree, bold: true, size: 22, font: "Calibri" })],
        spacing: { before: 100, after: 40 },
      }),
      new Paragraph({
        children: [
          new TextRun({
            text: `${edu.institution} | ${edu.dates}`,
            size: 20,
            font: "Calibri",
            color: "718096",
          }),
        ],
        spacing: { after: 100 },
      })
    );
  }

  const doc = new Document({
    sections: [
      {
        properties: { margin: { top: 720, right: 720, bottom: 720, left: 720 } },
        children,
      },
    ],
  });
  return await Packer.toBuffer(doc);
}

// PDF Generators
async function generateCVPDF(cvData) {
  return new Promise((resolve) => {
    const doc = new PDFDocument({ margin: 40 });
    let buffers = [];
    doc.on("data", buffers.push.bind(buffers));
    doc.on("end", () => resolve(Buffer.concat(buffers)));

    // Header
    doc.fillColor("#1a365d").fontSize(22).text(cvData.personalInfo.fullName.toUpperCase(), { align: "center" }).moveDown(0.2);
    doc.fillColor("#4a5568").fontSize(10).text(`${cvData.personalInfo.email} | ${cvData.personalInfo.phone} | ${cvData.personalInfo.location}`, { align: "center" }).moveDown(1.5);

    // Thick divider line
    doc.strokeColor("#1a365d").lineWidth(2).moveTo(40, doc.y).lineTo(570, doc.y).stroke().moveDown(1.5);

    const renderSectionHeader = (title) => {
      doc.fillColor("#1a365d").fontSize(13).text(title, { bold: true }).moveDown(0.2);
      doc.strokeColor("#e2e8f0").lineWidth(1).moveTo(40, doc.y).lineTo(570, doc.y).stroke().moveDown(0.8);
    };

    // Summary
    renderSectionHeader("PROFESSIONAL SUMMARY");
    doc.fillColor("#000000").fontSize(10.5).text(cvData.summary, { lineGap: 2 }).moveDown(1.5);

    // Experience
    renderSectionHeader("PROFESSIONAL EXPERIENCE");
    for (const job of cvData.experience) {
      doc.fillColor("#000000").fontSize(11).text(job.title, { continued: true, bold: true });
      doc.fillColor("#a0aec0").text("  |  ", { continued: true });
      doc.fillColor("#000000").text(job.company, { oblique: true }).moveDown(0.2);
      
      doc.fillColor("#718096").fontSize(9.5).text(`${job.location} | ${job.dates}`).moveDown(0.5);
      
      doc.fillColor("#000000").fontSize(10.5);
      for (const ach of job.achievements) {
        doc.text(`• ${ach}`, { indent: 15, lineGap: 1.5 });
      }
      doc.moveDown(1);
    }

    // Skills
    renderSectionHeader("SKILLS");
    doc.fillColor("#000000").fontSize(10.5).text(cvData.skills.join("  •  "), { lineGap: 2 }).moveDown(1.5);

    // Education
    renderSectionHeader("EDUCATION");
    for (const edu of cvData.education) {
      doc.fillColor("#000000").fontSize(11).text(edu.degree, { bold: true }).moveDown(0.2);
      doc.fillColor("#718096").fontSize(9.5).text(`${edu.institution} | ${edu.dates}`).moveDown(1);
    }

    doc.end();
  });
}

async function generateTextPDF(title, body) {
  return new Promise((resolve) => {
    const doc = new PDFDocument({ margin: 50 });
    let buffers = [];
    doc.on("data", buffers.push.bind(buffers));
    doc.on("end", () => resolve(Buffer.concat(buffers)));

    doc.fontSize(18).text(title, { align: "center" }).moveDown(2);
    doc.fontSize(12).text(body, { align: "left", lineGap: 5 });

    doc.end();
  });
}

app.post("/api/tailor-cv", upload.single("cv"), async (req, res) => {
  try {
    const { jobDescription, options: optionsStr } = req.body;
    const options = JSON.parse(optionsStr);
    const cvFile = req.file;

    const cvContent = await parseCVContent(cvFile.path, cvFile.mimetype);
    const tailoredCVResponse = await generateTailoredCV(cvContent, jobDescription);
    const cvData = JSON.parse(tailoredCVResponse.replace(/```json|```/g, "").trim());
    const candidateName = cvData.personalInfo.fullName;

    const results = {};
    const promises = [];

    if (options.cv) {
      promises.push((async () => {
        results.cv = { preview: tailoredCVResponse, fileName: `${candidateName}_CV.${options.format}` };
        results.cv.fileData = (await (options.format === "pdf" ? generateCVPDF(cvData) : generateCVDocx(cvData))).toString("base64");
      })());
    }

    if (options.coverLetter) {
      promises.push((async () => {
        const text = await generateCoverLetter(cvContent, jobDescription, candidateName);
        results.coverLetter = { preview: text, fileName: `${candidateName}_Cover_Letter.${options.format}` };
        results.coverLetter.fileData = (await (options.format === "pdf" ? generateTextPDF("Cover Letter", text) : generateTextDocx("Cover Letter", text))).toString("base64");
      })());
    }

    if (options.email) {
      promises.push((async () => {
        const text = await generateApplicationEmail(cvContent, jobDescription, candidateName);
        results.email = { preview: text, fileName: `${candidateName}_Email.${options.format}` };
        results.email.fileData = (await (options.format === "pdf" ? generateTextPDF("Application Email", text) : generateTextDocx("Application Email", text))).toString("base64");
      })());
    }

    await Promise.all(promises);
    fs.unlinkSync(cvFile.path);
    res.json({ success: true, ...results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/health", (req, res) => res.json({ status: "OK" }));
app.listen(PORT, () => console.log(`Magic CV running on ${PORT}`));
