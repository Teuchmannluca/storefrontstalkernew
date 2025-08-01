# Project Management Dashboard

A modern project management dashboard built with Next.js, React, and Supabase for authentication and data storage.

## Features

- 🔐 Secure authentication with Supabase
- 📊 Modern dashboard interface
- 🎨 Beautiful UI with Tailwind CSS
- 🚀 Built with Next.js 14 and TypeScript
- 📱 Fully responsive design

## Getting Started

### Prerequisites

- Node.js 18+ installed
- A Supabase account and project

### Installation

1. Install dependencies:
```bash
npm install
```

2. Set up your environment variables in `.env.local`:
```
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

3. Run the development server:
```bash
npm run dev
```

4. Open [http://localhost:3000](http://localhost:3000) in your browser

## Usage

1. **Sign Up**: Create a new account on the login page
2. **Verify Email**: Check your email for the confirmation link from Supabase
3. **Sign In**: Log in with your credentials
4. **Dashboard**: Access your project management dashboard

## Project Structure

```
src/
├── app/
│   ├── page.tsx          # Login page
│   ├── dashboard/
│   │   └── page.tsx      # Dashboard page
│   ├── layout.tsx        # Root layout
│   └── globals.css       # Global styles
├── lib/
│   └── supabase.ts       # Supabase client
└── middleware.ts         # Route protection
```

## Next Steps

This dashboard is ready for expansion with:
- Amazon storefront monitoring features
- Project creation and management
- Real-time monitoring alerts
- Data visualization
- Team collaboration features

## Technologies Used

- **Next.js 14**: React framework with App Router
- **TypeScript**: Type-safe development
- **Tailwind CSS**: Utility-first CSS framework
- **Supabase**: Authentication and database
- **React 18**: UI library