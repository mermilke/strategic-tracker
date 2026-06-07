# Strategic Tracker Setup Guide

> A click-by-click walkthrough for beginners. If you already know your way
> around Next.js and Supabase, the [README](README.md) covers the same ground
> faster.

## What you're building
A private web app where a manager's direct reports submit weekly check-ins on their strategic goals. The manager gets a live dashboard showing who submitted, what's at risk, and who needs support.

The whole stack is free:
- **Supabase** for the database and login
- **Next.js** for the web app
- **Vercel** for free hosting, so your team can get to it online
- **VS Code**, which you already have

---

## Phase 1: Install the tools (one time only)

### Step 1: Install Node.js
1. Go to https://nodejs.org
2. Download the **LTS** version (the left button)
3. Run the installer and click through with the defaults
4. Open VS Code, then open a new Terminal (Terminal menu > New Terminal)
5. Type `node --version` and press Enter. You should see something like `v20.x.x`

### Step 2: Get the project folder
Two ways to do this.

**Option A, download the zip (easiest):**
- You'll get the project as a zip file
- Unzip it somewhere easy to find, like `C:\Projects\strategic-tracker`
- In VS Code: File > Open Folder, then pick that folder

**Option B, clone it with git:**
- In the VS Code Terminal: `cd C:\Projects` (or wherever you want it)
- `git clone https://github.com/YOUR-USERNAME/strategic-tracker.git`
- In VS Code: File > Open Folder, then pick the `strategic-tracker` folder

---

## Phase 2: Set up Supabase (your database)

### Step 3: Create a Supabase account
1. Go to https://supabase.com and click **Start your project**
2. Sign up with GitHub or email (free)
3. Click **New project**
4. Fill in:
   - **Name:** `strategic-tracker` (or anything)
   - **Database password:** make something strong, and save it somewhere
   - **Region:** pick the closest to you (e.g. US East)
5. Click **Create new project**. It takes about a minute to set up.

### Step 4: Run the database setup
1. In your Supabase project, click **SQL Editor** in the left sidebar
2. Click **New query**
3. Open the file `supabase_setup.sql` from your project folder
4. Copy everything in that file
5. Paste it into the SQL Editor
6. Click **Run** (or press Ctrl+Enter)
7. You should see "Success. No rows returned", which means it worked.

### Step 5: Get your API keys
1. In Supabase, click **Project Settings** (gear icon, bottom left)
2. Click **API** in the settings menu
3. There are two values you need here:
   - **Project URL**, which looks like `https://abcdefgh.supabase.co`
   - **anon public key**, a long string starting with `eyJ...`
4. Keep this tab open, you'll need these in the next step

---

## Phase 3: Configure and run the app

### Step 6: Set up your environment file
1. In VS Code, look in your project folder for a file called `.env.example`
2. Make a copy of it and name the copy `.env.local`
3. Open `.env.local` and fill in your values:
```
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJyour-long-key-here
```
4. Save the file

### Step 7: Install dependencies and run
In the VS Code Terminal:
```bash
npm install
npm run dev
```

The first run takes a minute. Once you see:
```
▲ Next.js 14.x.x
- Local: http://localhost:3000
```
open your browser to **http://localhost:3000** and your app is running.

---

## Phase 4: Add your team

### Step 8: Create your first user (yourself as admin)
1. Go to http://localhost:3000/login
2. Use **Magic Link** mode and enter your email
3. Check your email and click the link
4. You're logged in now, but your role still needs to be set to `admin`

### Step 9: Set your role to admin
1. Go back to Supabase > **Table Editor** > `users` table
2. Find the row with your email
3. Click the `role` cell and change it from `direct_report` to `admin`
4. Click Save

Refresh your browser and you'll see the manager dashboard and Manage Team menu.

### Step 10: Invite your direct reports
1. In Supabase > **Authentication** > **Users** > **Invite user**
2. Enter their email address
3. They'll get an email to set a password
4. Once they sign up, go to **Table Editor** > `users`, find their row, and their role is already `direct_report`
5. If you want someone to have manager-view only (your boss, say), change their role to `manager`

### Step 11: Set up objectives
1. In your app, go to **Manage Team** (top nav)
2. Use **Add Objective** to create strategic objectives for each person
3. Use **Add Sub-Objective** to add the trackable items under each objective
4. This is the data that shows up in each person's weekly check-in form

---

## Phase 5: Deploy online (so your team can access it)

### Step 12: Create a Vercel account
1. Go to https://vercel.com and sign up (free)
2. Signing up with GitHub is the easiest route

### Step 13: Push to GitHub (needed for Vercel)
1. Go to https://github.com and create a free account if you don't have one
2. Create a new repository called `strategic-tracker` and set it to **Private**
3. In the VS Code Terminal:
```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/YOUR-USERNAME/strategic-tracker.git
git push -u origin main
```

### Step 14: Deploy to Vercel
1. Go to https://vercel.com/new
2. Import your GitHub repository
3. Before clicking Deploy, click **Environment Variables** and add:
   - `NEXT_PUBLIC_SUPABASE_URL` = your Supabase URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = your Supabase anon key
4. Click **Deploy**
5. After a couple of minutes you'll get a live URL like `https://strategic-tracker-yourname.vercel.app`

**Share that URL with your team.** They can bookmark it and use it from any device.

---

## How the app works day-to-day

**Direct reports:**
- Go to the app URL
- Click **Weekly Check-in**
- For each sub-objective, last week's status is already filled in
- They update status, progress, support needed, and comments
- Hit Save

**You (admin):**
- The dashboard shows all direct reports, submission progress, and at-risk items
- Filter by "Needs manager Support" to pull all the action items for your boss
- Filter by "Missing" to see who hasn't submitted yet

**Your manager:**
- Log them in with the `manager` role
- They get the same manager dashboard view

---

## Tips

- Remind your team every Monday. You can share the direct link to the check-in page.
- To archive old objectives, go to Manage Team and use the Active/Archived toggle.
- Add new sub-objectives anytime; they show up in the next check-in right away.
- To export data to Excel: Supabase > Table Editor > `weekly_checkins` > Download CSV.

---

## Need help?
If something isn't working, the usual suspects are:
1. A space or typo in your `.env.local` values, so copy-paste carefully
2. The Supabase SQL didn't fully run, so check for red error messages in the SQL Editor
3. The role wasn't updated, so check the `users` table in the Supabase Table Editor
