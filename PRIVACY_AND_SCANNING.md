# Privacy, Security & How Scanning Works

## Report Privacy & Protection

### Your Reports Are Private by Default

As of version 1.2, all vulnerability reports are **protected by an API key**:

- **Each session gets a unique API key** displayed in Settings
- **Reports cannot be accessed** without the correct API key
- **API key is required** when downloading or viewing reports
- **Only you** with your API key can see your reports and data

### How to Protect Your Reports

1. **Keep your API key private** - Treat it like a password
2. **Regenerate your key** in Settings if you suspect it's been shared
3. **Never share your API key** in emails, chat, or public forums
4. **Copy the key** from Settings when needed for integrations

### API Key Management

```bash
# Your API key is displayed in Settings
# Use it when making API calls:

curl -H "X-API-Key: zap_sk_xxxxx" \
  https://your-app.com/api/reports/export/scan-id?format=json

# Or as query parameter:
https://your-app.com/api/reports/export/scan-id?format=json&apiKey=zap_sk_xxxxx
```

---

## How Website Scanning Works

### The Scanner Works from YOUR Computer

When you run the scanner locally or via Docker:

1. **Your computer makes the requests** - Not from a remote server
2. **It connects to the target website** (e.g., example.com)
3. **Analyzes the response** for security issues
4. **Never stores website content** - Only findings

### What the Scanner Can Scan

✅ **Public websites** (facebook.com homepage, example.com, etc.)
✅ **Any website accessible via HTTP/HTTPS**
✅ **Local websites** (localhost, internal IPs)
✅ **Cloud applications** (if publicly accessible)

### What It Cannot Scan

❌ **Password-protected pages** - Requires login credentials
❌ **Private networks** - Behind firewall (without VPN)
❌ **Blocked websites** - Firewall or region restrictions
❌ **Rate-limited sites** - May be blocked after many requests

### Scanning Facebook Example

```
Target URL: https://www.facebook.com
✓ CAN scan the public homepage
✓ Can analyze HTTP security headers
✓ Can check HTTPS/SSL configuration
✓ Can detect common misconfigurations

❌ CANNOT access logged-in pages
❌ CANNOT extract user data
❌ CANNOT bypass authentication
❌ CANNOT access private profiles
```

The scanner only analyzes **public, static content** - what any visitor could see in their browser.

---

## Security Considerations

### For the App Administrator

1. **API Keys are session-based** - Lost if you restart the app
   - In production, store them in a database
   - Implement user accounts for persistence

2. **Scans are stored in memory** - Not persisted between restarts
   - Production deployment should use PostgreSQL
   - See DOCKER_SETUP.md for database configuration

3. **Data is not encrypted** - Local development only
   - HTTPS should be used in production
   - Sensitive data should be encrypted at rest

### For Users

1. **Your scan targets are visible to anyone with your API key**
   - Don't share your key
   - Use separate keys for different environments

2. **Scan results may contain sensitive information**
   - Be careful when sharing reports
   - Redact information before sharing with third parties

3. **Rate limiting** - Some websites may block frequent scans
   - Use reasonable scan intervals
   - Respect target website's Terms of Service

---

## Best Practices

### Running Safely

1. **Only scan websites you own or have permission to test**
2. **Respect website Terms of Service** - May prohibit automated scanning
3. **Use reasonable scan intervals** - Don't overload targets
4. **Keep your API key private** - Like a password
5. **Review findings carefully** - Check for false positives

### Sharing Reports

If you need to share a report:

1. Export as JSON or HTML
2. Review for sensitive information
3. Share only with authorized people
4. Use secure channels (email encryption, secure file sharing)
5. Consider redacting database connection strings, API keys, etc.

---

## Technical Details

### Vulnerabilities Detected

- **Security Headers**: CSP, HSTS, X-Frame-Options, X-Content-Type-Options
- **HTTPS/SSL**: Certificate validity, TLS version, cipher strength
- **Cookies**: Secure flag, HttpOnly flag, SameSite attribute
- **Information Disclosure**: Server headers, version strings, error messages
- **Common Issues**: Redirects, CORS misconfiguration, weak authentication

### Scanner Limitations

- **No authentication**: Cannot test login flows or protected content
- **No JavaScript execution**: Only analyzes HTTP responses
- **No database access**: Cannot find SQL injection without credentials
- **No file upload testing**: Cannot test file upload vulnerabilities
- **Single request per page**: No multi-step attack scenarios

### Performance

- **Quick scan**: ~5-15 seconds per URL
- **API request timeout**: 10 seconds per target
- **Concurrent scans**: Run one at a time (queue-based)

---

## FAQ

**Q: Can I scan my production website?**
A: Yes, but test carefully first. Consider scheduling scans during low-traffic periods.

**Q: Does the scanner damage websites?**
A: No, it only makes read requests and analyzes responses. It never modifies data.

**Q: Can I scan Facebook, Google, Amazon?**
A: Yes for public pages, but respect their Terms of Service and rate limiting.

**Q: Where are my scan results stored?**
A: In-memory in development. In production with Docker, can be stored in PostgreSQL.

**Q: How long do scan results last?**
A: Until the app restarts (in-memory) or until manually deleted.

**Q: Can I export my scan results?**
A: Yes, export as JSON or HTML from the Reports page (requires API key).

**Q: Is my data backed up?**
A: Not in the development version. Use PostgreSQL in production for persistence.

**Q: Can I integrate with other tools?**
A: Yes, use the API with your API key. See README.md for endpoints.
