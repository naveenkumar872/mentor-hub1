
import json

USERS_FILE = r'd:\Mentor\Mentor\data\users.json'

data = {
    "HEMA PRIYA": ["PRABANJAN", "SANJEEV KUMAR", "NITHISH", "VENKATESH", "HARINI P (B SEC)", "THARANIYA", "HARINI P (A SEC)"],
    "RAKSHITA": ["ANUSHREE", "HEMACHANDRAN", "RAVIKANTH", "HARISH", "PRADEEP RAJ", "RHINDHIYA", "SHIVANI"],
    "BUMIKA": ["GANESH I", "DAKSHANAMOORTHY", "THEENASH", "SANGARADAS", "SRIVATSAN", "NARMADHA", "KAVITHA"],
    "KRISHNA KUMAR": ["AISWA MALAR", "HEMAJOTHI", "DEVISRI", "VAISHAL MALLU", "RAYYAN", "VISHNU PRASATH"],
    "SHYAAM KUMAR": ["MANOJ KUMAR", "ABISHEK BEHARA", "RAGUL", "GURALARASAN", "JAIDHAR", "SUBITSHA"],
    "HARESH G": ["ARUN SRINIVAS", "DAKSHA CHARAN", "PRAVEEN KUMAR", "ROHAN KUMAR", "THANUSH", "SIDARTH", "VISHWA P"],
    "KAVESH": ["ABDUL KALAM", "ABIEESHWAR", "AKILESH", "BHARANIDHARAN", "KARTHIKEYAN", "NAVANEETHAKRISHNAN", "RATHNA PRASAD"],
    "LOKESH": ["HEMESHWARAN", "MANIKANDAN", "MUGASH", "AL RAAFATH", "DHIVYANAND", "LOKESHWAR", "VISHAL S"],
    "LAVANYA": ["MEENALOSHINI", "CHANDRA", "NITHYA SHRI B", "SIVARANJANI", "SRI AISHWARYA", "HARINI (REDO)", "HARINI A"],
    "DHINESHKUMAR G": ["AKSHAYA", "SUSHMIDHA M", "INDHUJA S", "MORDHEESH", "NITHYA SHRI V", "PRIYANKA", "KANIMOZHI"],
    "GOKULAN": ["PRATHEEB E", "PRIYAMADHAN", "SATHIYAN", "SUDHARSAN", "KARTHIK M", "HEMSHAKTHIRAM"],
    "SHARLI": ["DAMINI", "REYASH", "HARIJA", "PRAMILA", "SUSHMA", "ASWITTA"],
    "ABIRAMI": ["KARMUGILAN", "LALITHAMBIGA", "MOHANAPRIYA", "UTHRADEVI", "NAVEEN KUMAR", "GANESH DEEPAK", "VISHNU LAKSHMI"],
    "APARNAA": ["AMIRTHA BHANU", "DHIVYA", "HAFZA", "AGALYA", "HARIPRIYA", "SHIVANI", "KAVIYA P S"]
}

with open(USERS_FILE, 'r', encoding='utf-8') as f:
    users_data = json.load(f)

users = users_data['users']

# Ensure mentors exist and clear their allocations
mentor_map = {}
for mentor_name in data.keys():
    found = False
    for u in users:
        if u['role'] == 'mentor' and u['name'].upper() == mentor_name.upper():
            mentor_map[mentor_name] = u['id']
            u['allocatedStudents'] = [] # Reset
            found = True
            break
    if not found:
        # Create mentor if it doesn't exist (though they should)
        mentor_id = f"mentor-{len([u for u in users if u['role'] == 'mentor']) + 1:03d}"
        mentor_email = mentor_name.lower().replace(" ", "") + "@edu.com"
        new_mentor = {
            "id": mentor_id,
            "email": mentor_email,
            "password": "password123",
            "role": "mentor",
            "name": mentor_name,
            "avatar": "👨‍🏫",
            "specialization": "Full Stack & Machine Learning",
            "allocatedStudents": [],
            "createdAt": "2026-02-03T11:00:00Z"
        }
        users.append(new_mentor)
        mentor_map[mentor_name] = mentor_id

# Update students or create them
student_count = len([u for u in users if u['role'] == 'student'])
for mentor_name, student_names in data.items():
    mentor_id = mentor_map[mentor_name]
    for student_name in student_names:
        found = False
        for u in users:
            if u['role'] == 'student' and u['name'].upper() == student_name.upper():
                u['mentorId'] = mentor_id
                # Also add to mentor's allocatedStudents
                for m in users:
                    if m['id'] == mentor_id:
                        if u['id'] not in m['allocatedStudents']:
                            m['allocatedStudents'].append(u['id'])
                found = True
                break
        if not found:
            student_count += 1
            student_id = f"student-{student_count:03d}"
            student_email = student_name.lower().replace(" ", "").replace("(", "").replace(")", "").replace(".", "") + "@edu.com"
            new_student = {
                "id": student_id,
                "email": student_email,
                "password": "password123",
                "role": "student",
                "name": student_name,
                "avatar": "🎓",
                "mentorId": mentor_id,
                "batch": "2026",
                "createdAt": "2026-02-03T11:00:00Z"
            }
            users.append(new_student)
            # Add to mentor's allocatedStudents
            for m in users:
                if m['id'] == mentor_id:
                    m['allocatedStudents'].append(student_id)

with open(USERS_FILE, 'w', encoding='utf-8') as f:
    json.dump(users_data, f, indent=2)

print("Successfully updated user allocations.")
