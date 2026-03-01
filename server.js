const express = require("express");
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");
const { PrismaClient } = require("@prisma/client");
const ExcelJS = require("exceljs");

require("dotenv").config();

const prisma = new PrismaClient();
const app = express();

app.use(cors());
app.use(express.json());


// ===============================
// 🔐 AUTH LOGIN
// ===============================
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

app.post("/auth/login", async (req, res) => {

  const { username, password } = req.body;

  const user = await prisma.user.findUnique({
    where: { username }
  });

  if (!user)
    return res.status(400).send("User not found");

  const valid = await bcrypt.compare(password, user.password);

  if (!valid)
    return res.status(400).send("Wrong password");

  const token = jwt.sign(
    { id: user.id, role: user.role },
    process.env.JWT_SECRET
  );

  res.send({ token, role: user.role });
});


// ===============================
// 🎫 CREATE SERIES
// ===============================
app.post("/admin/create-series", async (req, res) => {

  const { start, end, category } = req.body;

  let data = [];

  for (let i = Number(start); i <= Number(end); i++) {

    data.push({
      ticketNumber: `${i}`,
      category,
      status: "LISTED"
    });
  }

  await prisma.ticket.createMany({ data });

  res.send("Series created");
});


// Single ticket create
app.post("/admin/create-single", async (req, res) => {

  const { ticketNumber, category } = req.body;

  await prisma.ticket.create({
    data: {
      ticketNumber,
      category,
      status: "LISTED"
    }
  });

  res.send("Ticket created");
});


// ===============================
// 📋 UNSOLD
// ===============================
app.get("/admin/unsold", async (req, res) => {

  const tickets = await prisma.ticket.findMany({
    where: { status: "LISTED" }
  });

  res.send(tickets);
});


// ===============================
// 💰 SELL
// ===============================
app.post("/admin/sell", async (req, res) => {

  const { ticketNumbers } = req.body;

  await prisma.ticket.updateMany({
    where: { ticketNumber: { in: ticketNumbers } },
    data: { status: "SOLD", soldAt: new Date() }
  });

  res.send("Tickets Sold");
});

app.post("/admin/unsell", async (req, res) => {

  const { ticketNumbers } = req.body;

  await prisma.ticket.updateMany({
    where: { ticketNumber: { in: ticketNumbers } },
    data: {
      status: "LISTED",
      soldAt: null
    }
  });

  res.send("Tickets reverted to LISTED");
});


// 📋 SOLD tickets
app.get("/admin/sold", async (req, res) => {

  const tickets = await prisma.ticket.findMany({
    where: { status: "SOLD" }
  });

  res.send(tickets);
});


// ===============================
// 🚪 VERIFY
// ===============================
app.post("/verify/verify", async (req, res) => {

  const { ticketNumber } = req.body;

  const ticket = await prisma.ticket.findUnique({
    where: { ticketNumber }
  });

  if (!ticket) return res.send("INVALID");

  if (ticket.status === "VERIFIED")
    return res.send("DUPLICATE");

  if (ticket.status !== "SOLD")
    return res.send("INVALID");

  await prisma.ticket.update({
    where: { ticketNumber },
    data: {
      status: "VERIFIED",
      verifiedAt: new Date()
    }
  });

  res.send("VALID");
});


app.get("/admin/export", async (req, res) => {

  const tickets = await prisma.ticket.findMany();

  const wb = new ExcelJS.Workbook();

  // Group by category
  const categories = {};

  tickets.forEach(t => {
    if (!categories[t.category])
      categories[t.category] = [];
    categories[t.category].push(t);
  });

  for (const cat in categories) {

    const sheet = wb.addWorksheet(cat);

    sheet.addRow(["Ticket", "Status"]);

    categories[cat].forEach(t => {

      const row = sheet.addRow([
        t.ticketNumber,
        t.status
      ]);

      if (t.status === "SOLD") {
        row.eachCell(c =>
          c.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "FFFFFF00" }
          });
      }

      if (t.status === "VERIFIED") {
        row.eachCell(c =>
          c.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "FF00FF00" }
          });
      }
    });
  }

  res.setHeader(
    "Content-Disposition",
    "attachment; filename=tickets.xlsx"
  );

  await wb.xlsx.write(res);
  res.end();
});

app.get("/admin/stats", async (req, res) => {

  // TOTAL
  const listed = await prisma.ticket.count({
    where: { status: "LISTED" }
  });

  const sold = await prisma.ticket.count({
    where: { status: "SOLD" }
  });


  // LISTED CATEGORY
  const listedByCategory = await prisma.ticket.groupBy({
    by: ["category"],
    where: { status: "LISTED" },
    _count: true
  });


  // SOLD CATEGORY
  const soldByCategory = await prisma.ticket.groupBy({
    by: ["category"],
    where: { status: "SOLD" },
    _count: true
  });


  res.send({
    listed,
    sold,
    listedByCategory,
    soldByCategory
  });
});


// ===============================
// ⚡ SOCKET SYNC
// ===============================
const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: "*" }
});

io.on("connection", socket => {

  socket.on("verified", data => {
    io.emit("update", data);
  });
});

server.listen(5000, () =>
  console.log("🚀 Server running on port 5000")
);