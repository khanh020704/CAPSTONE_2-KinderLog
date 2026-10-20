# CAPSTONE_2-KinderLog
Preschool Daily Journal &amp; Reporting System with Multimodal AI Integration

## Running on a new machine

### 1. Install once
- Node.js 22.9 or newer
- SQL Server Express (instance `SQLEXPRESS`)
- ODBC Driver 17 for SQL Server

### 2. Backend (`BE`)
Copy `BE/.env.example` to `BE/.env` and fill in:
- `JWT_SECRET`: a random string (the command to make one is in the file)
- `GROQ_API_KEY`: a key from console.groq.com. Optional: without it, voice reports are sorted by a keyword classifier instead of the AI
- `DB_SERVER`, `DB_NAME`: usually left as `(local)\SQLEXPRESS` and `KinderLog`

Then:
```
cd BE
npm install
npm run migrate                              # creates the KinderLog database and its tables
npm run create-admin -- admin <password>     # the first admin account
npm run dev                                  # http://localhost:3000, API docs at /api/docs
```

### 3. Frontend (`FE`)
Copy `FE/.env.example` to `FE/.env.local`, then:
```
cd FE
npm install
npm run dev                                  # http://localhost:5173
```

### Data
A new database is empty: sign in as the admin and create the school, classes and accounts.
To start from a database backup (`.bak`, shared privately, never committed), restore it in SQL Server
Management Studio as `KinderLog`, then run `npm run migrate` to bring it up to date and
`npm run create-admin -- admin <password> --reset-password` to set the admin's password.

### Tests
```
cd BE
npm test                                     # unit tests
python Debug/debug_api.py                    # end-to-end checks against a throwaway database (from the repo root)
```
