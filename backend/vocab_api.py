import csv
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import Dict, Any, Optional
import random
import os
from datetime import datetime, timedelta
import json
from fastapi.middleware.cors import CORSMiddleware
import re


app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Environment variable for CSV file path
CSV_FILE_PATH = os.getenv("VOCAB_CSV_PATH", "vocab.csv")

def normalize_term(term: str) -> str:
    """Normalize a term for recall matching."""
    # Remove content within brackets and parentheses
    term = re.sub(r'\[.*?\]|\(.*?\)', '', term)
    # Remove punctuation and convert to lowercase
    term = re.sub(r'[^\w\s]', '', term.lower())
    # Remove extra whitespace
    term = ' '.join(term.split())
    return term

# Load vocabulary from CSV
def load_vocab():
    vocab = {}
    normalized_vocab = {}
    with open(CSV_FILE_PATH, 'r') as f:
        reader = csv.DictReader(f)
        for row in reader:
            term = row['Term']
            vocab[term] = row['Definition']
            normalized_vocab[normalize_term(term)] = term
    return vocab, normalized_vocab

VOCAB, NORMALIZED_VOCAB = load_vocab()

# User data structure
class TermProgress(BaseModel):
    status: str
    last_tested: Optional[str] = None
    last_correct: Optional[str] = None
    times_correct: int = 0

class UserData(BaseModel):
    name: str
    progress: Dict[str, TermProgress]

class AnswerSubmission(BaseModel):
    term: str
    answer: str
    used_hint: bool = False
    is_recall: bool = False

# Load user data from JSON file
def load_user_data():
    try:
        with open('user_data.json', 'r') as f:
            data = json.load(f)
            return {name: UserData(name=name, progress={term: TermProgress(**progress) for term, progress in user_data['progress'].items()})
                    for name, user_data in data.items()}
    except FileNotFoundError:
        return {}

# Save user data to JSON file
def save_user_data(data: Dict[str, UserData]):
    with open('user_data.json', 'w') as f:
        json.dump({name: user_data.dict() for name, user_data in data.items()}, f)

USER_DATA = load_user_data()

@app.post("/login")
async def login(name: str):
    if name not in USER_DATA:
        USER_DATA[name] = UserData(
            name=name,
            progress={term: TermProgress(status="untested") for term in VOCAB}
        )
        save_user_data(USER_DATA)
    return {"message": "Logged in successfully"}

@app.get("/next_term/{user}")
async def next_term(user: str):
    if user not in USER_DATA:
        raise HTTPException(status_code=404, detail="User not found")
    
    user_progress = USER_DATA[user].progress
    current_time = datetime.now()
    
    # Filter terms based on status and last tested time
    sorted_terms = sorted(
        user_progress.items(),
        key=lambda item: (
            item[1].status == "untested",  # False comes before True, untested terms first
            item[1].last_tested if item[1].last_tested else datetime.min,  # Sort by last_tested, oldest first
            item[1].status == "answered_incorrectly",  # Then sort by incorrect answers
            item[1].status != "remembered"  # Finally, sort by non-remembered status
        ),
        reverse=False  # Maintain the order with False first (untested, oldest to newest, then incorrect, then non-remembered)
    )

    # Extracting only the terms after sorting
    eligible_terms = [term for term, _ in sorted_terms]
    
    if not eligible_terms:
        return {"message": "No more terms to test"}
    
    term = random.choice(eligible_terms)
    definition = VOCAB[term]
    
    options = [term]
    while len(options) < 4:
        random_term = random.choice(list(VOCAB.keys()))
        if random_term not in options:
            options.append(random_term)
    random.shuffle(options)
    
    return {
        "term": term,
        "definition": definition,
        "options": options if user_progress[term].times_correct == 0 else None
    }

@app.post("/answer/{user}")
async def submit_answer(user: str, submission: AnswerSubmission):
    if user not in USER_DATA:
        raise HTTPException(status_code=404, detail="User not found")
    
    if submission.term not in VOCAB:
        raise HTTPException(status_code=404, detail="Term not found")
    
    user_progress = USER_DATA[user].progress
    term_progress = user_progress[submission.term]
    current_time = datetime.now()
    
    if submission.is_recall:
        normalized_answer = normalize_term(submission.answer)
        normalized_term = normalize_term(submission.term)
        correct = normalized_answer == normalized_term
    else:
        correct = submission.answer.strip() == submission.term.strip()
    
    term_progress.last_tested = current_time.isoformat()
    
    if correct:
        if submission.is_recall and not submission.used_hint:
            term_progress.status = "recalled_correctly"
            term_progress.times_correct += 1
        elif not submission.is_recall:
            term_progress.status = "answered_correctly"
            term_progress.times_correct += 1
        
        if term_progress.times_correct >= 2 and term_progress.status != "remembered":
            last_correct_time = datetime.fromisoformat(term_progress.last_correct) if term_progress.last_correct else None
            if last_correct_time and (current_time - last_correct_time) >= timedelta(hours=12):
                term_progress.status = "remembered"
        
        term_progress.last_correct = current_time.isoformat()
    else:
        if term_progress.status != "recalled_correctly":
            term_progress.status = "answered_incorrectly"
            term_progress.times_correct = 0
    
    save_user_data(USER_DATA)
    
    return {
        "correct": correct,
        "correct_term": submission.term
    }

@app.get("/progress/{user}")
async def get_progress(user: str):
    if user not in USER_DATA:
        raise HTTPException(status_code=404, detail="User not found")
    
    user_progress = USER_DATA[user].progress
    total = len(user_progress)
    
    stats = {
        "remembered": 0,
        "recalled_correctly": 0,
        "answered_correctly": 0,
        "answered_incorrectly": 0,
        "untested": 0
    }
    
    for term_data in user_progress.values():
        stats[term_data.status] += 1
    
    return {
        "total": total,
        "stats": stats
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)