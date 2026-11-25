"""Direct standalone script to create/repair Aura Jewelry and Volt Electronics tenants."""
from sqlmodel import Session
from app.database import engine
from app.seed import seed_aura_jewelry_company, seed_volt_electronics_company

def run():
    print("Seeding Aura Jewelry and Volt Electronics...")
    with Session(engine) as session:
        seed_aura_jewelry_company(session)
        seed_volt_electronics_company(session)
        session.commit()
        print("Successfully seeded AURA-JEWELRY and VOLT-ELECTRONICS companies, stores, and admin users!")

if __name__ == "__main__":
    run()
