# Session integration after Antigravity finishes `app/index.tsx`

The repository and startup table are ready. Apply these small edits to the final UI version of `app/index.tsx`. The file is deliberately untouched here because Antigravity is editing it.

1. Import `loginAndSaveSession`, `restoreSession`, and `clearSession` from `../src/session`. Remove the `login` import from `../src/domain`. Keep `ActivityIndicator` and `View`, which the current file already imports.
2. Beside `const [actor, setActor] = useState<Actor | null>(null);`, add `const [restoring, setRestoring] = useState(true);`.
3. After the state declarations, add:

   ```tsx
   useEffect(() => {
     let live = true;
     restoreSession(db)
       .then(saved => { if (live) setActor(saved); })
       .catch(() => { if (live) setError('Local session could not be read. Try reopening the app.'); })
       .finally(() => { if (live) setRestoring(false); });
     return () => { live = false; };
   }, [db]);
   ```

4. In `handleLogin`, replace `login(db, user, pass, orgName)` with `loginAndSaveSession(db, user, pass, orgName)`. Keep `setActor(a)` after the awaited call.
5. Make `handleLogout` asynchronous. Before `setActor(null)`, await `clearSession(db)`. If clearing fails, keep the actor signed in and show an error rather than claiming logout succeeded. For example:

   ```tsx
   async function handleLogout() {
     try {
       await clearSession(db);
       setActor(null);
       setCurrentTab('Home');
       setActiveSubSection(null);
       setMisSearch('');
       setError('');
     } catch {
       setError('Logout could not clear the local session. Try again.');
     }
   }
   ```

6. Immediately before the existing `if (!actor)` login screen branch, add:

   ```tsx
   if (restoring) {
     return <View style={{ flex: 1, justifyContent: 'center' }}><ActivityIndicator /></View>;
   }
   ```

The SQLite provider in `app/_layout.tsx` completes database initialization before rendering this route. Its error boundary handles database initialization failure. This route guard prevents a login-screen flash while a valid session is being restored.

After integration, run `npm run typecheck`, `npm run test:domain`, `npm run test:seed`, and `npm run check:offline`, then verify login, force-stop/reopen, and logout/reopen on Android.
