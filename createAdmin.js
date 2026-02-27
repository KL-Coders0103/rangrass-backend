const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const prisma = new PrismaClient();

async function main() {

  const hash = await bcrypt.hash("admin123", 10);

  await prisma.user.create({
    data: {
      username: "admin",
      password: hash,
      role: "admin"
    }
  });

  console.log("Admin created");
}

main();