import cv2
import time
import firebase_admin
from firebase_admin import credentials, db

# --- Firebase Setup ---
# Initialize the app with a service account, granting admin privileges
cred = credentials.Certificate("Code/firebase_key.json")

# TODO: Replace with your actual Firebase Realtime Database URL
firebase_admin.initialize_app(cred, {
    'databaseURL': 'https://campus-sense-e73a0-default-rtdb.firebaseio.com/' 
})

# Get a reference to the specific room in the database
room_ref = db.reference('campus/rooms/301')

# Configuration constants
TIME_TO_TURN_OFF = 10  
last_seen_time = time.time()
is_room_occupied = False
systems_on = True
hazard_detected = False

# Function to update Firebase
def update_firebase():
    room_ref.set({
        'isOccupied': is_room_occupied,
        'systemsOn': systems_on,
        'hazardReported': hazard_detected,
        'lastUpdated': time.time()
    })

# Initialize OpenCV's built-in face detector
face_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_frontalface_default.xml')

cap = cv2.VideoCapture(0)

print("Campus-Sense Prototype Running with Firebase...")
print("Controls: 's' to report hazard, 'c' to clear hazard, 'q' to quit.")

# Initial push to Firebase to set starting state
update_firebase()

while cap.isOpened():
    success, image = cap.read()
    if not success:
        print("Error: Could not access the camera.")
        break

    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    faces = face_cascade.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=5, minSize=(30, 30))

    # Keep track of states to know when to update Firebase (avoiding spamming the DB)
    state_changed = False

    # Occupancy Logic
    if len(faces) > 0:
        if not is_room_occupied:
            is_room_occupied = True
            state_changed = True
            
        last_seen_time = time.time()
        
        if not systems_on:
            print("--> Occupancy detected: Systems ON")
            systems_on = True
            state_changed = True
            
        for (x, y, w, h) in faces:
            cv2.rectangle(image, (x, y), (x+w, y+h), (0, 255, 0), 2)
    else:
        if is_room_occupied:
            is_room_occupied = False
            state_changed = True

    # Energy Saving Logic
    time_empty = time.time() - last_seen_time
    if not is_room_occupied and systems_on and time_empty > TIME_TO_TURN_OFF:
        print("--> Auto-shutdown: Systems OFF")
        systems_on = False
        state_changed = True

    # --- Keyboard Interactions ---
    key = cv2.waitKey(5) & 0xFF
    if key == ord('q'): 
        break
    elif key == ord('s') and not hazard_detected: 
        hazard_detected = True
        state_changed = True
        print("!!! ALERT: Hazard reported in Room 301 !!!")
    elif key == ord('c') and hazard_detected: 
        hazard_detected = False
        state_changed = True
        print("--> Hazard cleared.")

    # Push to Firebase only if something changed!
    if state_changed:
        update_firebase()

    # --- UI Overlay ---
    occ_color = (0, 255, 0) if is_room_occupied else (0, 0, 255)
    sys_color = (255, 255, 0) if systems_on else (100, 100, 100)
    
    cv2.putText(image, "Room: 301", (20, 40), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2)
    cv2.putText(image, f"Occupancy: {'Yes' if is_room_occupied else 'No'}", (20, 70), cv2.FONT_HERSHEY_SIMPLEX, 0.7, occ_color, 2)
    cv2.putText(image, f"Systems: {'ON' if systems_on else 'OFF'}", (20, 100), cv2.FONT_HERSHEY_SIMPLEX, 0.7, sys_color, 2)
    
    if hazard_detected:
        cv2.rectangle(image, (0, 0), (image.shape[1], 50), (0, 0, 255), -1)
        cv2.putText(image, "!!! HAZARD DETECTED: SPILL REPORTED !!!", (50, 35), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (255, 255, 255), 3)

    cv2.imshow('Campus-Sense Terminal', image)

cap.release()
cv2.destroyAllWindows()