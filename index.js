const { google } = require('googleapis');
require('dotenv').config();
const express = require('express')
const OAuth2Data = require('./google_key.json')
const axios = require('axios')
const app = express()

const cors = require('cors')
app.use(cors());

const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.SECRET_KEY;
const REDIRECT_URL = OAuth2Data.web.redirect_uris[0];


const oAuth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URL)
var authed = false;


app.get('/', (req, res) => {
    if (authed)
        return res.redirect('/user');
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Welcome</title>
            <link href="https://maxcdn.bootstrapcdn.com/bootstrap/4.5.2/css/bootstrap.min.css" rel="stylesheet">
        </head>
        <body>
            <nav class="navbar navbar-expand-lg navbar-light bg-light">
                <a class="navbar-brand" href="#">YourApp</a>
                <button class="navbar-toggler" type="button" data-toggle="collapse" data-target="#navbarNav" aria-controls="navbarNav" aria-expanded="false" aria-label="Toggle navigation">
                    <span class="navbar-toggler-icon"></span>
                </button>
                <div class="collapse navbar-collapse" id="navbarNav">
                    <ul class="navbar-nav">
                        <li class="nav-item active">
                            <a class="nav-link" href="/">Home <span class="sr-only">(current)</span></a>
                        </li>
                        <li class="nav-item">
                            <a class="nav-link" href="/login">Login</a>
                        </li>
                        <li class="nav-item">
                            <a class="nav-link" href="/login-github">Login with GitHub</a>
                        </li>
                    </ul>
                </div>
            </nav>
            <h1>Welcome to the site</h1>
            <a href='/login'>Log in with Google</a> <br>
            <a href='/login-github'>Log in with GitHub</a>
        </body>
        </html>
    `);
})

app.get('/login', (req, res) => {
    if (!authed) {
        const url = oAuth2Client.generateAuthUrl({
            access_type: 'offline',
            scope: 'https://www.googleapis.com/auth/userinfo.profile'
        });
        res.redirect(url);
    } else {
        res.redirect('/user');
    }
});

const getUsers = (request, response) => {
    console.log('Pobieram dane ...');
    pool.query('SELECT * FROM users', (error, res) => {
        if (error) {
            console.error('Error fetching users', error);
            response.status(500).send('Error fetching users');
        } else {
            console.log('Dostałem ...');
            let userDisplayData = res.rows.map(row => {
                return `<div>User ID: ${row.id}, Name: ${row.name}, Joined: ${row.joined}, Last Visit: ${row.lastvisit}, Counter: ${row.counter}</div>`;
            }).join('');
            response.send(userDisplayData);
        }
    });
};

const upsertUser = async (userInfo) => {
    const { name } = userInfo;
    const currentDate = new Date().toISOString();

    const query = `
        INSERT INTO users (name, joined, lastvisit, counter)
        VALUES ($1, $2, $2, 1)
            ON CONFLICT (name)
        DO UPDATE SET lastvisit = $2, counter = users.counter + 1;
    `;

    try {
        await pool.query(query, [name, currentDate]);
        console.log('User upserted successfully.');
    } catch (error) {
        console.error('Error upserting user:', error);
    }
};



app.get('/user', (req, res) => {
    if (!authed)
        return res.redirect('/');

    const oauth2 = google.oauth2({ auth: oAuth2Client, version: 'v2' });
    oauth2.userinfo.v2.me.get(function (err, result) {
        let loggedUser;
        if (err) {
            console.log('Error fetching Google user data:', err);
            return res.status(500).send('Error during the fetching of user data');
        }
        else {
            loggedUser = result.data.name;
            console.log(loggedUser);
            // Display logged-in user info and provide a link to fetch user data from database
            const userInfoDisplay = `Logged in: ${result.data.name} <br/> <img src='${result.data.picture}' height='23' width='23' /> <a href='/logout'>Wyloguj</a><br/><br/> <a href='/users'>Show Users</a>`;
            res.send(userInfoDisplay);
        }
    });
})

app.get('/users', (req, res) => {
    // Assuming `pool` is your database connection pool
    pool.query('SELECT * FROM users', (error, results) => {
        if (error) {
            res.status(500).send('Error fetching users');
        } else {
            let userTableRows = results.rows.map(user => `
                <tr>
                    <td>${user.id}</td>
                    <td>${user.name}</td>
                    <td>${user.joined}</td>
                    <td>${user.lastvisit}</td>
                    <td>${user.counter}</td>
                </tr>
            `).join('');

            res.send(`
                <table class="table table-hover">
                    <thead class="thead-light">
                        <tr>
                            <th>ID</th>
                            <th>Name</th>
                            <th>Joined</th>
                            <th>Last Visit</th>
                            <th>Counter</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${userTableRows}
                    </tbody>
                </table>
            `);
        }
    });
});

app.get('/logout', (req, res) => {
    authed = false;
    res.redirect('/');
})

app.get('/auth/google/callback', async function (req, res) {
    const code = req.query.code;
    if (code) {
        try {
            const { tokens } = await oAuth2Client.getToken(code);
            oAuth2Client.setCredentials(tokens);
            authed = true;

            const oauth2 = google.oauth2({ auth: oAuth2Client, version: 'v2' });
            const userinfo = await oauth2.userinfo.v2.me.get();

            await upsertUser({
                email: userinfo.data.email,
                name: userinfo.data.name
            });

            res.redirect('/user');
        } catch (err) {
            console.log('Error authenticating or fetching user data:', err);
            res.redirect('/');
        }
    }
});


app.get('/login-github', (req, res) => {
    res.redirect(`https://github.com/login/oauth/authorize?client_id=${process.env.CLIENT_ID_GITHUB}`);

});

app.get('/github/callback', (req, res) => {

    const requestToken = req.query.code

    axios({
        method: 'post',
        url: `https://github.com/login/oauth/access_token?client_id=${process.env.CLIENT_ID_GITHUB}&client_secret=${process.env.SECRET_KEY_GITHUB}&code=${requestToken}`,
        headers: {
            accept: 'application/json'
        }
    }).then((response) => {
        access_token = response.data.access_token
        authed = true;
        res.redirect('/user-github');
    })
})

app.get('/user-github', function (req, res) {
    if (!authed)
        return res.redirect('/');

    axios({
        method: 'get',
        url: `https://api.github.com/user`,
        headers: {
            Authorization: 'token ' + access_token
        }
    }).then((response) => {
        res.send(`Name: ${response.data.name} <br/> <a href='/logout'>Wyloguj</a> <br> <a href='/users'>Show Users</a>`)
    })
});

app.get('/logout', (req, res) => {
    authed = false;  // Invalidate server-side authentication flag

    // Redirect to client-side logout page
    res.redirect('/logout-page');
});

app.get('/logout-page', (req, res) => {
    const logoutPageHTML = `
        <html>
            <head>
                <script src="https://apis.google.com/js/platform.js" async defer></script>
                <script>
                    function signOut() {
                        var auth2 = gapi.auth2.getAuthInstance();
                        auth2.signOut().then(function () {
                            console.log('User signed out.');
                            window.location = '/';
                        });
                    }
                </script>
            </head>
            <body onload="signOut();">
                <p>Logging out...</p>
            </body>
        </html>
    `;
    res.send(logoutPageHTML);
});

require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_DATABASE,
    password: process.env.DB_PASSWORD,
    port: parseInt(process.env.DB_PORT, 10),
    ssl: {
        rejectUnauthorized: false, // For development purposes only; for production set up proper SSL certificate validation
    }
});

const port = 8080
app.listen(port, () => console.log(`Server running at ${port}`));
