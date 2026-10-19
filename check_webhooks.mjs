import { PrismaClient } from '@prisma/client';
import fs from 'fs';

const content = fs.readFileSync('/home/ubuntu/apps/A-OSB/.env', 'utf8');
const lines = content.split('\n');
let token = '';

for (const line of lines) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  if (trimmed.startsWith('BOT_TOKEN=') || trimmed.startsWith('DISCORD_TOKEN=')) {
    const val = trimmed.slice(trimmed.indexOf('=') + 1).trim();
    token = val.replace(/^['"]|['"]$/g, '');
    break;
  }
}

// Check A-OSB prisma webhooks
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL || 'postgresql://ubuntu@localhost:5432/osb_production?schema=public'
    }
  }
});

const webhooks = await prisma.webhook.findMany();
console.log(`Found ${webhooks.length} webhooks in A-OSB DB:`, webhooks);

for (const wh of webhooks) {
  try {
    const res = await (await fetch(`https://discord.com/api/v10/webhooks/${wh.webhook_id}/${wh.webhook_token}`)).json();
    console.log(`Discord Webhook ${wh.webhook_id}:`, {
      name: res.name,
      avatar: res.avatar,
      channel_id: res.channel_id,
      guild_id: res.guild_id
    });
  } catch (err) {
    console.error(`Failed to fetch webhook ${wh.webhook_id}:`, err);
  }
}

await prisma.$disconnect();
