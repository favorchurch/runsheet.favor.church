import { config } from 'dotenv';
config({ path: '.env.local' });
import { rockResolveAccess } from "./src/server-actions/internal/rockResolveAccess";

async function main() {
    const res = await rockResolveAccess(4185);
    console.log("RolesMap for Person 4185:", JSON.stringify(res.rolesMap, null, 2));
}

main().catch(console.error);
