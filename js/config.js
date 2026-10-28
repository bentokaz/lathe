'use strict';
// Online accounts (optional). Without these two values Lathe still works and keeps songs in the browser.
// To switch accounts on, make a free Supabase project and copy its Project URL and anon (publishable) key
// here, never the secret key; README.md has the steps. The anon key is meant to be public: the database
// rules set up in the README make sure each person can only read and change their own songs.
L.CLOUD = {
  url: '',
  key: '',
};
