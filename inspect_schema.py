
import os
import sys
from dotenv import load_dotenv
from sqlalchemy import create_engine, text, inspect

# Load environment variables
load_dotenv()

DATABASE_URL = os.getenv('DATABASE_URL')

# Fix for pymysql and TiDB (SSL handling)
if DATABASE_URL and 'mysql://' in DATABASE_URL:
    DATABASE_URL = DATABASE_URL.replace('mysql://', 'mysql+pymysql://')

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
    
    print("Writing to schema_output.txt")
    inspector = inspect(engine)
    with open('schema_output.txt', 'w') as f:
        f.write("Columns in 'aptitude_tests' table:\n")
        try:
            columns_pt = inspector.get_columns('aptitude_tests')
            for column in columns_pt:
                f.write(f"- {column['name']} ({column['type']})\n")
        except Exception as e:
            f.write(f"Error inspecting aptitude_tests table: {e}\n")
    print("File written")

except Exception as e:
    print(f"Error: {e}")
    # Fallback
    try:
        engine = create_engine(DATABASE_URL)
        connection = engine.connect()
        print("Connection successful (fallback)!")
        inspector = inspect(engine)
        columns = inspector.get_columns('users')
        for column in columns:
            print(f"- {column['name']}")
    except Exception as e2:
        print(f"Error fallback: {e2}")
