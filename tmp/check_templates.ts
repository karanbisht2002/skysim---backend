
import { db } from '../server/db';

async function checkTemplates() {
    try {
        const templates = await db.query.emailTemplates.findMany();
        console.log('Templates in Database:');
        templates.forEach(t => {
            console.log(`- Type: ${t.eventType}, Subject: ${t.subject}`);
        });
    } catch (err) {
        console.error(err);
    }
    process.exit(0);
}

checkTemplates();
