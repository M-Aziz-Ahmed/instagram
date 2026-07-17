$env:Path = "C:\Users\Aziz Ahmed\AppData\Roaming\Python\Python314\Scripts;" + $env:Path
certbot certonly --dns-duckdns --dns-duckdns-token "0db3b520-3ba4-4487-8905-dc0955462e77" -d anontweet.duckdns.org --agree-tos --email azizahmed10088@gmail.com --no-eff-email --non-interactive
pause
