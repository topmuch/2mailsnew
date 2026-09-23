import sharp from "sharp";
import { PrismaClient } from "@prisma/client";
import fs from "fs";

const prisma = new PrismaClient();
const buffer = await sharp("/tmp/logo-2mails-raw.png")
  .resize(256, 256, { fit: "cover" })
  .png({ quality: 90, compressionLevel: 9 })
  .toBuffer();
fs.writeFileSync("/home/z/my-project/public/logo-2mails.png", buffer);
const dataUrl = `data:image/png;base64,${buffer.toString("base64")}`;
const setting = await prisma.setting.findFirst();
if (setting) {
  await prisma.setting.update({ where: { id: setting.id }, data: { logo: dataUrl } });
  console.log("DB logo updated");
} else {
  await prisma.setting.create({ data: { logo: dataUrl } });
  console.log("DB setting created with logo");
}
console.log("PNG size:", buffer.length, "bytes");
await prisma.$disconnect();
