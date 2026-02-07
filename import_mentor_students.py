import os
import csv
from sqlalchemy import create_engine, text
from urllib.parse import urlparse
from dotenv import load_dotenv
from uuid import uuid4

# Load environment variables
load_dotenv()

DATABASE_URL = os.getenv('DATABASE_URL')
CSV_FILE = r'd:\Mentor\mentor_students.csv'

# Fix for pymysql and TiDB (SSL handling)
if DATABASE_URL and 'mysql://' in DATABASE_URL:
    DATABASE_URL = DATABASE_URL.replace('mysql://', 'mysql+pymysql://')

print(f"Connecting to database...")

try:
    engine = create_engine(
        DATABASE_URL, 
        connect_args={
            "ssl": {
                "ssl_mode": "VERIFY_IDENTITY",
            }
        } if 'tidbcloud' in DATABASE_URL else {}
    )
    connection = engine.connect()
    print("Connection successful!")
except Exception as e:
    print(f"Connection failed: {e}")
    # Fallback without specific SSL args
    try:
        engine = create_engine(DATABASE_URL)
        connection = engine.connect()
        print("Connection successful (fallback)!")
    except Exception as e2:
        print(f"Connection failed again: {e2}")
        exit(1)

def check_or_create_mentor(mentor_name):
    """Check if HOD mentor exists, create if not"""
    # Check if mentor exists
    result = connection.execute(
        text("SELECT id, name FROM users WHERE role = 'mentor' AND name = :name"),
        {"name": mentor_name}
    )
    mentor = result.fetchone()
    
    if mentor:
        print(f"Mentor '{mentor_name}' found with ID: {mentor[0]}")
        return mentor[0]
    
    # Create HOD mentor if doesn't exist
    mentor_id = str(uuid4())
    connection.execute(
        text("""
            INSERT INTO users (id, email, password, role, name, created_at)
            VALUES (:id, :email, :password, :role, :name, NOW())
        """),
        {
            "id": mentor_id,
            "email": f"{mentor_name.lower().replace(' ', '.')}@mentor.com",
            "password": "hod123",  # Default password
            "role": "mentor",
            "name": mentor_name
        }
    )
    connection.commit()
    print(f"Created new mentor '{mentor_name}' with ID: {mentor_id}")
    return mentor_id

def check_or_create_student(student_name, mentor_id):
    """Check if student exists, create if not, and link to mentor"""
    # Check if student exists
    result = connection.execute(
        text("SELECT id, name, mentor_id FROM users WHERE role = 'student' AND name = :name"),
        {"name": student_name}
    )
    student = result.fetchone()
    
    if student:
        student_id = student[0]
        current_mentor_id = student[2]
        
        # Update mentor_id if different
        if current_mentor_id != mentor_id:
            connection.execute(
                text("UPDATE users SET mentor_id = :mentor_id WHERE id = :id"),
                {"mentor_id": mentor_id, "id": student_id}
            )
            connection.commit()
            print(f"  Updated student '{student_name}' - assigned to new mentor")
        else:
            print(f"  Student '{student_name}' already exists and is assigned to the correct mentor")
        
        return student_id
    
    # Create student if doesn't exist
    student_id = str(uuid4())
    email = f"{student_name.lower().replace(' ', '.').replace('_', '')}@student.com"
    
    connection.execute(
        text("""
            INSERT INTO users (id, email, password, role, name, mentor_id, created_at)
            VALUES (:id, :email, :password, :role, :name, :mentor_id, NOW())
        """),
        {
            "id": student_id,
            "email": email,
            "password": "student123",  # Default password
            "role": "student",
            "name": student_name,
            "mentor_id": mentor_id
        }
    )
    connection.commit()
    print(f"  Created new student '{student_name}' with ID: {student_id}")
    return student_id

def create_allocation(mentor_id, student_id):
    """Create or update mentor-student allocation"""
    # Check if allocation exists
    result = connection.execute(
        text("SELECT * FROM mentor_student_allocations WHERE mentor_id = :mentor_id AND student_id = :student_id"),
        {"mentor_id": mentor_id, "student_id": student_id}
    )
    
    if result.fetchone():
        print(f"    Allocation already exists")
        return
    
    # Create allocation
    connection.execute(
        text("INSERT INTO mentor_student_allocations (mentor_id, student_id) VALUES (:mentor_id, :student_id)"),
        {"mentor_id": mentor_id, "student_id": student_id}
    )
    connection.commit()
    print(f"    Created allocation record")

def main():
    if not os.path.exists(CSV_FILE):
        print(f"CSV file not found: {CSV_FILE}")
        return
    
    print(f"\nReading CSV file: {CSV_FILE}")
    
    with open(CSV_FILE, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        rows = list(reader)
    
    print(f"Found {len(rows)} student records\n")
    
    # Group by mentor
    mentor_students = {}
    for row in rows:
        mentor = row['Mentor']
        student = row['Student']
        
        if mentor not in mentor_students:
            mentor_students[mentor] = []
        mentor_students[mentor].append(student)
    
    # Process each mentor and their students
    for mentor_name, students in mentor_students.items():
        print(f"\n{'='*60}")
        print(f"Processing Mentor: {mentor_name}")
        print(f"{'='*60}")
        
        # Create or get mentor
        mentor_id = check_or_create_mentor(mentor_name)
        
        print(f"\nProcessing {len(students)} students:")
        for student_name in students:
            # Create or get student
            student_id = check_or_create_student(student_name, mentor_id)
            
            # Create allocation
            create_allocation(mentor_id, student_id)
    
    print(f"\n{'='*60}")
    print("Data import completed successfully!")
    print(f"{'='*60}")
    
    # Show summary
    result = connection.execute(text("SELECT COUNT(*) FROM users WHERE role = 'mentor'"))
    mentor_count = result.fetchone()[0]
    
    result = connection.execute(text("SELECT COUNT(*) FROM users WHERE role = 'student'"))
    student_count = result.fetchone()[0]
    
    result = connection.execute(text("SELECT COUNT(*) FROM mentor_student_allocations"))
    allocation_count = result.fetchone()[0]
    
    print(f"\nDatabase Summary:")
    print(f"  Total Mentors: {mentor_count}")
    print(f"  Total Students: {student_count}")
    print(f"  Total Allocations: {allocation_count}")

if __name__ == "__main__":
    main()
