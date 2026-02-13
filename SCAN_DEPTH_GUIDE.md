# Scan Depth Configuration Guide

## Overview
The scanner supports three scan depth levels: **Shallow**, **Medium**, and **Deep**. Each level balances speed vs thoroughness.

---

## 📊 Comparison Table

| Feature | Shallow | Medium | Deep |
|---------|---------|--------|------|
| **Estimated Time** | 1-3 minutes | 5-10 minutes | 15-30 minutes |
| **Httpx** | ✅ Yes | ✅ Yes | ✅ Yes |
| **Nmap** | ❌ Skipped | ✅ Top 100 ports | ✅ Top 1000 ports |
| **Nikto** | ❌ Skipped | ✅ 30s timeout | ✅ Full scan (no timeout) |
| **ZAP Spider** | 5 pages | 10 pages | Unlimited |
| **ZAP Timeout** | 30 seconds | 3 minutes | 10 minutes |

---

## 🔍 Shallow Scan - Quick Assessment

**Use Case:** Fast vulnerability check for quick feedback or frequent scans

### What it does:
- ✅ **Httpx**: Validates target and detects technologies
- ❌ **Nmap**: Skipped (saves 1-2 minutes)
- ❌ **Nikto**: Skipped (saves 30 seconds)
- ⚡ **ZAP**: Ultra-fast scan (5 pages, 30s max)

### Technical Details:
```javascript
// Nmap: Completely skipped
throw new Error("Nmap skipped in shallow mode");

// Nikto: Completely skipped  
throw new Error("Nikto skipped in shallow mode");

// ZAP Configuration
maxChildren: 5        // Only spider 5 pages
timeout: 30000ms      // 30 seconds max
```

### Best For:
- Quick security checks
- CI/CD pipeline integration
- Frequent automated scans
- Initial reconnaissance

---

## ⚖️ Medium Scan - Balanced Approach

**Use Case:** Standard security audit with reasonable time investment

### What it does:
- ✅ **Httpx**: Full validation
- ✅ **Nmap**: Scans top 100 most common ports
- ✅ **Nikto**: 30-second limited scan
- 📍 **ZAP**: Standard scan (10 pages, 3 min max)

### Technical Details:
```javascript
// Nmap Command
nmap -T4 -F -sV --version-light --max-retries 1 --host-timeout 5m

// Nikto Command
nikto -h ${url} -maxtime 30s -Tuning x6

// ZAP Configuration
maxChildren: 10       // Spider 10 pages
timeout: 180000ms     // 3 minutes max
```

### Best For:
- Regular security audits
- Production environment checks
- Balanced speed/depth requirements
- **Default recommended option**

---

## 🔬 Deep Scan - Comprehensive Analysis

**Use Case:** Thorough security assessment, compliance requirements

### What it does:
- ✅ **Httpx**: Full validation
- ✅ **Nmap**: Scans top 1000 ports (10x more than medium)
- ✅ **Nikto**: Full unlimited scan
- 🌐 **ZAP**: Comprehensive scan (all pages, 10 min max)

### Technical Details:
```javascript
// Nmap Command
nmap -T4 --top-ports 1000 -sV --version-light --max-retries 1 --host-timeout 10m

// Nikto Command
nikto -h ${url} -Tuning x6 -nointeractive
// No maxtime limit - runs until complete

// ZAP Configuration
maxChildren: 0        // Unlimited pages (spider entire site)
timeout: 600000ms     // 10 minutes max
```

### Best For:
- Pre-production security audits
- Compliance requirements (PCI-DSS, etc)
- Thorough vulnerability assessment
- When time is not a constraint

---

## 🎯 Detailed Component Behavior

### 1. Httpx (All Modes)
- **Always runs** regardless of scan depth
- Validates target reachability
- Detects technologies (frameworks, servers, etc)
- Quick execution (~5-10 seconds)

### 2. Nmap Port Scanner
| Mode | Ports Scanned | Command Flag | Time |
|------|---------------|--------------|------|
| Shallow | 0 (skipped) | N/A | 0s |
| Medium | 100 | `-F` | ~30-60s |
| Deep | 1000 | `--top-ports 1000` | ~2-5 min |

### 3. Nikto Web Scanner
| Mode | Max Time | Details |
|------|----------|---------|
| Shallow | Skipped | N/A |
| Medium | 30 seconds | Limited quick checks |
| Deep | Unlimited | Full comprehensive scan |

### 4. OWASP ZAP Scanner
| Mode | Pages | Timeout | Description |
|------|-------|---------|-------------|
| Shallow | 5 | 30s | Homepage + 4 linked pages |
| Medium | 10 | 3 min | Main sections of site |
| Deep | ∞ | 10 min | Complete site crawl |

---

## 💡 Recommendations

### Choose **Shallow** if:
- ⏰ Time is critical (< 3 minutes needed)
- 🔄 Running frequent automated scans
- 🚀 CI/CD pipeline integration
- 👁️ Just need quick visibility

### Choose **Medium** if:
- ⚖️ Need balanced speed/thoroughness
- 📅 Regular weekly/monthly audits
- 💼 Standard security compliance
- 🎯 **Most common use case**

### Choose **Deep** if:
- 🔬 Comprehensive assessment required
- 📋 Compliance audit (PCI-DSS, SOC2)
- 🏢 Pre-production security validation
- 💰 Security budget allows longer scans

---

## 🛠️ Configuration Files Modified

1. **`server/services/nmap.ts`**
   - Added `scanDepth` parameter
   - Configures port range based on depth

2. **`server/services/nikto.ts`**
   - Added `scanDepth` parameter
   - Adjusts timeout based on depth

3. **`server/zap-client.ts`**
   - Modified `startScan()` to accept depth
   - Configures spider maxChildren
   - Adjusts scan timeout in `performScan()`

4. **`server/scanner.ts`**
   - Passes scanType to all services
   - Skips Nmap/Nikto for shallow mode
   - Improved progress tracking

---

## 📈 Performance Metrics

| Metric | Shallow | Medium | Deep |
|--------|---------|--------|------|
| Avg Time | 1-3 min | 5-10 min | 15-30 min |
| Ports Checked | 0 | 100 | 1000 |
| Pages Crawled | 5 | 10 | All |
| Nikto Checks | 0 | ~20-30 | ~100+ |
| ZAP Tests | Basic | Standard | Comprehensive |

---

## 🔧 Advanced Customization

To further customize scan depths, edit these files:

### Adjust Nmap Port Count:
```typescript
// server/services/nmap.ts
command = `nmap --top-ports 2000 ...`  // Increase to 2000 for ultra-deep
```

### Adjust ZAP Timeout:
```typescript
// server/zap-client.ts
if (scanDepth === "deep") {
  maxWaitMs = 1200000; // Increase to 20 minutes
}
```

### Adjust Nikto Time Limit:
```typescript
// server/services/nikto.ts
command = `nikto -maxtime 60s ...`  // Increase to 1 minute for medium
```

---

**Last Updated:** 2026-02-10
**Version:** 1.0
