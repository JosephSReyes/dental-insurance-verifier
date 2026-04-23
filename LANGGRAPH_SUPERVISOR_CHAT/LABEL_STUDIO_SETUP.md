# Label Studio Setup Instructions

## Step 1: Get API Token

1. Open Label Studio in your browser: **http://localhost:8081**
2. Log in (or create an account if this is first time)
3. Click your profile icon in the top-right corner
4. Go to **Account & Settings**
5. Click on **Access Token** tab
6. Copy your API token

## Step 2: Update .env File

Add or update the following line in `.env`:
```
LABEL_STUDIO_API_KEY="<your-token-here>"
```

## Step 3: Run Setup Script

Once you have the valid token, run:
```bash
cd LANGGRAPH_SUPERVISOR_CHAT/apps/agents
node setup-label-studio.js
```

This will:
- Create a new project called "Dental Insurance Verification Review"
- Import 3 recent verifications as tasks
- Apply custom theme colors matching your review page (purple #673499, cyan #63DAE0)

## Step 4: Access Your Project

The script will output a URL like:
```
http://localhost:8081/projects/1
```

Open this URL to start reviewing verifications in Label Studio!

## Custom Colors Applied

- **Primary**: #673499 (Purple)
- **Secondary**: #63DAE0 (Cyan)
- **Accent**: #0ED11C (Green)
- **Background**: #0f172a (Slate-950)

These match your existing review page at localhost:3000/review.
