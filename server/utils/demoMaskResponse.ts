import { Request, Response, NextFunction } from 'express';

const DEMO_EMAIL = process.env.DEMO_EMAIL;

// console.log("@@@@@@@DEMO_EMAIL", DEMO_EMAIL)

function isSensitiveKey(key: string): boolean {
    const k = key.toLowerCase();
    
    // Ignore toggles/booleans/status settings
    if (k.endsWith('_enabled') || k.endsWith('_show')) {
        return false;
    }
    
    // Check if the key contains any of these substrings
    const sensitiveTerms = [
        'smtp',
        'password',
        'pass',
        'secret',
        'private',
        'token',
        'credential',
        'api_key',
        'apikey',
        'service_account',
        'serviceaccount',
    ];
    
    if (sensitiveTerms.some(term => k.includes(term))) {
        return true;
    }
    
    // Check for specific settings groups that are sensitive config
    const sensitivePrefixes = [
        'firebase_',
        'smtp_',
        'recaptcha_',
        'apple_',
        'google_play_',
    ];
    
    if (sensitivePrefixes.some(prefix => k.startsWith(prefix))) {
        return true;
    }
    
    // Check for other specific sensitive keys
    const specificKeys = [
        'android_package_name',
        'preferred_provider_id',
    ];
    
    if (specificKeys.includes(k)) {
        return true;
    }
    
    return false;
}

function maskValue(value: any) {
    if (typeof value === 'string') {
        // email
        if (value.includes('@')) {
            const [n, d] = value.split('@');
            return n.slice(0, 2) + '****@' + d.slice(0, 2) + '***';
        }

        // phone number
        if (/^\d{8,15}$/.test(value)) {
            return value.slice(0, 2) + '******' + value.slice(-2);
        }
    }
    return value;
}

export async function demoMaskResponse(
    req: Request & { email?: string },
    res: Response,
    next: NextFunction
) {
    const email = req.email || (req as any).user?.email;
    const isDemo = !!DEMO_EMAIL && email === DEMO_EMAIL;
    if (!isDemo) return next();

    const oldJson = res.json;

    res.json = function (data: any) {
        const walk = (obj: any) => {
            if (!obj || typeof obj !== 'object') return obj;

            // Handle arrays of setting objects, e.g., [{ key: "firebase_api_key", value: "AIza..." }]
            if (
                typeof obj.key === 'string' &&
                'value' in obj &&
                isSensitiveKey(obj.key)
            ) {
                obj.value = '********';
            }

            for (const key in obj) {
                // If it is a dictionary/object and the key itself is sensitive (e.g. { firebase_api_key: "AIza..." })
                if (isSensitiveKey(key) && typeof obj[key] === 'string') {
                    obj[key] = '********';
                } else if (typeof obj[key] === 'object') {
                    obj[key] = walk(obj[key]);
                } else {
                    obj[key] = maskValue(obj[key]);
                }
            }
            return obj;
        };

        return oldJson.call(this, walk(data));
    };

    next();
}