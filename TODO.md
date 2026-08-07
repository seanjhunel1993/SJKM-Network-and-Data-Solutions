# Rebrand: SYNTAX SHELL → SJKM NETWORK DATA LINK

## Steps
- [x] 1. Analyze codebase & identify all "SYNTAX SHELL" occurrences
- [x] 2. Confirm new brand name with user (SJKM NETWORK DATA LINK)
- [x] 3. Edit public/admin/components/sidebar.html
- [x] 4. Edit public/admin/admin.js (2 places)
- [x] 5. Edit public/admin/clients.html (title)
- [x] 6. Edit public/admin/expenses.html (title)
- [x] 7. Edit public/admin/index.html (title)
- [x] 8. Edit public/admin/installations.html (title + heading)
- [x] 9. Edit public/admin/login.html (brand + check)
- [x] 10. Edit public/admin/logs.html (title)
- [x] 11. Edit public/admin/network-map.html (title)
- [x] 12. Edit public/admin/react-layout.html (title)
- [x] 13. Edit public/admin/sales.html (3 places)
- [x] 14. Edit public/admin/settings.html (title + preview + placeholder)
- [x] 15. Edit public/admin/settings.js (5 places)
- [x] 16. Edit public/admin/setup.html (heading + placeholder)
- [x] 17. Edit routes/admin.js (7 places)
- [x] 18. Edit server.js (startup banner)
- [x] 19. Update database company_name (already 'SJKM Network and Data Solutions')
- [x] 20. Verify changes

## Result
All hardcoded "SYNTAX SHELL" brand references replaced with "SJKM NETWORK DATA LINK" across 14 files (16 files including sidebar.html and settings.js). Database company_name already set to "SJKM Network and Data Solutions".

## Test Results
- ✅ Server starts successfully (port 3998)
- ✅ Startup banner shows "SJKM NETWORK DATA LINK - ONLINE"
- ✅ Branding API returns company_name: "SJKM Network and Data Solutions"
- ✅ Login page loads (Status 200) and contains "SJKM NETWORK DATA LINK"
- ✅ All JS files pass syntax check
