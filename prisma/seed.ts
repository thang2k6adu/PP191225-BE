import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const PUBLIC_TOPICS = ['math', 'coding', 'english', 'pomodoro'];

async function main() {
  const hashedPassword = await bcrypt.hash('password123', 10);

  const admin = await prisma.user.upsert({
    where: { email: 'admin@example.com' },
    update: {},
    create: {
      email: 'admin@example.com',
      password: hashedPassword,
      firstName: 'Admin',
      lastName: 'User',
      role: 'ADMIN',
      isActive: true,
    },
  });

  const user = await prisma.user.upsert({
    where: { email: 'user@example.com' },
    update: {},
    create: {
      email: 'user@example.com',
      password: hashedPassword,
      firstName: 'Regular',
      lastName: 'User',
      role: 'USER',
      isActive: true,
    },
  });

  console.log({ admin, user });

  // Create PUBLIC rooms for each topic
  console.log('Creating public rooms...');
  for (const topic of PUBLIC_TOPICS) {
    const livekitRoomName = `public-${topic}`;
    const room = await prisma.room.upsert({
      where: { livekitRoomName },
      update: {
        status: 'ACTIVE',
        type: 'PUBLIC',
        visibility: 'PUBLIC',
        topic,
      },
      create: {
        type: 'PUBLIC',
        topic,
        visibility: 'PUBLIC',
        status: 'ACTIVE',
        livekitRoomName,
        maxMembers: 10, // Public rooms can have more members
      },
    });
    console.log(`Created/updated public room: ${topic}`, room.id);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
