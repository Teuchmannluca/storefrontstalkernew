# 🚀 Deployment Checklist for Scheduling System

## ✅ Pre-Deployment Steps

### 1. Database Migration
- [ ] Copy SQL from `/supabase/create_user_schedule_settings.sql`
- [ ] Run in Supabase SQL Editor
- [ ] Verify tables created: `user_schedule_settings`
- [ ] Verify view created: `schedules_due_for_execution`
- [ ] Test RLS policies are working

### 2. Local Testing
- [ ] Run `node verify-security-setup.js` ✅ **DONE**
- [ ] Start dev server: `npm run dev`
- [ ] Navigate to `/dashboard/settings`
- [ ] Test schedule configuration UI
- [ ] Verify settings save properly

## 🔧 Vercel Deployment Steps

### 3. Environment Variables in Vercel
Add these in Vercel Dashboard → Settings → Environment Variables:

- [ ] `CRON_SECRET` = `storefront-cron-secret-2024`
- [ ] All existing environment variables from `.env.local`

### 4. Deploy to Vercel
- [ ] Push code to Git repository
- [ ] Deploy to Vercel (automatic or manual)
- [ ] Verify deployment successful
- [ ] Check Vercel Functions tab for cron job

### 5. Verify Cron Job Activation
- [ ] Go to Vercel Project → Settings → Cron Jobs tab
- [ ] Verify cron job appears: `/api/cron/check-schedules`
- [ ] Schedule: `0 * * * *` (every hour)
- [ ] Status should be "Active"

## ✅ Post-Deployment Testing

### 6. Test Complete Flow
- [ ] Create test schedule (set to run in next few minutes)
- [ ] Wait for cron execution
- [ ] Check Vercel Function logs
- [ ] Verify schedule updates work
- [ ] Check database for updated timestamps

### 7. Security Verification
- [ ] Test cron endpoint is protected (returns 401 without auth)
- [ ] Verify RLS policies prevent cross-user access
- [ ] Check logs for security warnings

## 🔍 Monitoring & Troubleshooting

### 8. Monitor Cron Jobs
- **Vercel Dashboard**: Functions tab shows cron execution logs
- **Supabase**: Check `user_schedule_settings` table for `last_run` updates
- **Application**: Users see "Last Run" and "Next Run" in settings

### 9. Common Issues & Solutions

**Issue**: Cron job not triggering
- **Solution**: Check Vercel cron jobs are enabled in project settings
- **Solution**: Verify `vercel.json` is in project root and deployed

**Issue**: "Unauthorized" errors in cron logs
- **Solution**: Ensure `CRON_SECRET` is set in Vercel environment variables
- **Solution**: Check Vercel cron uses proper user-agent header

**Issue**: Database permission errors
- **Solution**: Verify RLS policies were created correctly
- **Solution**: Check service role key has proper permissions

**Issue**: Timezone issues
- **Solution**: Verify PostgreSQL timezone functions work correctly
- **Solution**: Test with different user timezones

## 📊 Success Criteria

### 10. System is Working When:
- [ ] Users can configure schedules in `/dashboard/settings`
- [ ] Cron job runs every hour without errors
- [ ] Schedules execute at correct times (respecting timezones)
- [ ] Database updates show `last_run` and `next_run` properly
- [ ] Token management respects rate limits
- [ ] Users receive expected storefront updates

## 🎉 Go Live!

Once all checklist items are complete, your automatic scheduling system is ready for production use!

### Features Available to Users:
- ✅ Configure update frequency (daily, every 2 days, weekly)
- ✅ Set preferred time (24-hour selection with timezone support)
- ✅ Choose specific days for weekly schedules
- ✅ View last run and next run status
- ✅ Enable/disable automatic updates
- ✅ Automatic token management and rate limiting