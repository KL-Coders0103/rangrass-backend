const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const prisma = new PrismaClient();

async function main() {

  const hash = await bcrypt.hash("verifier123", 10);

  await prisma.user.create({
    data: {
      username: "gate3",
      password: hash,
      role: "verifier"
    }
  });

  console.log("Verifier created");
}

main();