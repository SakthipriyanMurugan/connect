import asyncio
import sys
from pathlib import Path

# Add backend directory to path
sys.path.append(str(Path(__file__).resolve().parent))

from sqlalchemy import select
from app.db.session import AsyncSessionLocal, init_db
from app.models.base import User

async def show_users():
    await init_db()
    async with AsyncSessionLocal() as session:
        result = await session.execute(select(User))
        users = result.scalars().all()
        
        print("\n" + "=" * 80)
        print("          VERTEX CONNECT - REGISTERED USERS IN DATABASE")
        print("=" * 80)
        
        if not users:
            print("  (Database is currently empty. Register or login to add users.)")
        else:
            print(f" {'CONNECT ID':<15} | {'NAME':<15} | {'EMAIL':<30} | {'ROLE':<10} | {'STATUS':<8}")
            print("-" * 80)
            for u in users:
                cid = f"@{u.connect_id}" if getattr(u, 'connect_id', None) else "-"
                print(f" {cid:<15} | {u.name:<15} | {u.email:<30} | {u.role:<10} | {u.status:<8}")
        
        print("=" * 80)
        print(f" Database file location: vertex_connect.db\n")

if __name__ == "__main__":
    asyncio.run(show_users())
