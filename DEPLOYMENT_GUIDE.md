# Shopnest Deployment Guide

This project is easiest to deploy as a single Node.js web service because the frontend is already served by Express.

## Recommended stack

- App hosting: Render
- Database: MongoDB Atlas
- Image storage: Cloudinary
- Payments: Razorpay
- Domain: Cloudflare or your registrar DNS

## Why this stack

- The app is a single Express service, so Render can host both frontend and backend together.
- MongoDB Atlas fits the existing Mongoose setup.
- Cloudinary avoids broken uploads on hosts with ephemeral file systems.
- Razorpay is already integrated in the checkout flow.

## Required environment variables

Copy values from [backend/.env.example](/h:/Project/shopnest/backend/.env.example:1).

- `NODE_ENV=production`
- `MONGO_URI`
- `JWT_SECRET`
- `JWT_EXPIRE`
- `ALLOWED_ORIGINS`
- `CLIENT_URL`
- `RAZORPAY_KEY_ID`
- `RAZORPAY_KEY_SECRET`
- `CLOUDINARY_CLOUD_NAME`
- `CLOUDINARY_API_KEY`
- `CLOUDINARY_API_SECRET`

## Step-by-step deployment

### 1. Push the repo to GitHub

Create a GitHub repository and push this project.

### 2. Create MongoDB Atlas

1. Go to MongoDB Atlas.
2. Create a free cluster.
3. Create a database user.
4. Allow network access from `0.0.0.0/0` for first deployment, then tighten later if needed.
5. Copy the connection string into `MONGO_URI`.

### 3. Create Cloudinary

1. Create a Cloudinary account.
2. Open the dashboard.
3. Copy:
   - cloud name
   - API key
   - API secret
4. Put them into the Cloudinary environment variables.

### 4. Prepare Razorpay

1. Open Razorpay dashboard.
2. Copy `key_id` and `key_secret`.
3. Use test keys first.
4. Put them into Render environment variables.

### 5. Deploy on Render

1. Go to Render.
2. Click `New +` -> `Blueprint`.
3. Connect your GitHub repo.
4. Render will detect [render.yaml](/h:/Project/shopnest/render.yaml:1).
5. Confirm the service.
6. In the service environment settings, add all variables from [backend/.env.example](/h:/Project/shopnest/backend/.env.example:1).
7. Set:
   - `CLIENT_URL=https://your-service-name.onrender.com`
   - `ALLOWED_ORIGINS=https://your-service-name.onrender.com`
8. Deploy.

### 6. Verify the deployment

After deploy, open:

- `https://your-service-name.onrender.com/`
- `https://your-service-name.onrender.com/admin`
- `https://your-service-name.onrender.com/api/health`
- `https://your-service-name.onrender.com/api/deployment-check`

The deployment check route confirms whether MongoDB, JWT, Razorpay, Cloudinary, and CORS variables are configured.

### 7. Create the production admin user

Set these temporary environment variables in Render:

- `ADMIN_NAME`
- `ADMIN_EMAIL`
- `ADMIN_PASSWORD`

Then open the Render shell and run:

```bash
npm run create-admin
```

This is safe for production. It creates the admin if missing, or updates the existing account password and role.

### 8. Seed initial data if you want demo content

If you want demo data:

1. Open the Render shell for the service.
2. Run:

```bash
node seed.js
```

Important: `seed.js` deletes existing users, categories, and products before recreating demo data. Do not run it on a live store with real data.

## Custom domain

After the Render deploy works:

1. Buy a domain from Namecheap, GoDaddy, or similar.
2. In Render, open `Settings` -> `Custom Domains`.
3. Add your domain.
4. Create the DNS records Render asks for.
5. Update:
   - `CLIENT_URL=https://www.yourdomain.com`
   - `ALLOWED_ORIGINS=https://www.yourdomain.com,https://yourdomain.com`

## Important production notes

- Do not rely on local `/uploads` storage on Render.
- Cloudinary should be configured before using admin image uploads.
- Set a strong `JWT_SECRET`.
- Use Razorpay test mode first, then swap to live keys.
- The admin panel is at `/admin`, so create your admin user before launch.

## Recommended launch order

1. Deploy to Render
2. Connect MongoDB Atlas
3. Connect Cloudinary
4. Test product creation with image upload
5. Test user signup/login
6. Test COD checkout
7. Test Razorpay checkout with test keys
8. Attach custom domain
