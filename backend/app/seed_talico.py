"""Direct standalone script to create/repair Tali Co Kitchen tenant."""
from sqlmodel import Session
from app.database import engine
from app.seed import seed_talico_company

def run():
    print("Seeding Tali Co Kitchen...")
    with Session(engine) as session:
        seed_talico_company(session)
        session.commit()
        print("Successfully seeded TALICO (Tali Co Kitchen) company, restaurant menu, tables, combos, and credentials!")

if __name__ == "__main__":
    run()
