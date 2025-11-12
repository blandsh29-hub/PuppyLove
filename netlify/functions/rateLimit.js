// Rate Limiter for Netlify Functions
// Simple in-memory rate limiting (good for low traffic)
// For production scale, use Redis or Upstash

const rateLimits = new Map();

// Clean up old entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, data] of rateLimits.entries()) {
    if (now - data.resetTime > 300000) { // 5 minutes
      rateLimits.delete(key);
    }
  }
}, 300000);

/**
 * Rate limiter middleware for Netlify functions
 * @param {string} identifier - Usually IP address or user ID
 * @param {number} maxRequests - Max requests allowed in window
 * @param {number} windowMs - Time window in milliseconds
 * @returns {Object} - { allowed: boolean, remaining: number, resetTime: number }
 */
export function checkRateLimit(identifier, maxRequests = 100, windowMs = 60000) {
  const now = Date.now();
  const key = `limit:${identifier}`;
  
  let limitData = rateLimits.get(key);
  
  // First request or window expired
  if (!limitData || now - limitData.resetTime > windowMs) {
    limitData = {
      count: 1,
      resetTime: now + windowMs
    };
    rateLimits.set(key, limitData);
    
    return {
      allowed: true,
      remaining: maxRequests - 1,
      resetTime: limitData.resetTime
    };
  }
  
  // Within window
  if (limitData.count < maxRequests) {
    limitData.count++;
    return {
      allowed: true,
      remaining: maxRequests - limitData.count,
      resetTime: limitData.resetTime
    };
  }
  
  // Rate limit exceeded
  return {
    allowed: false,
    remaining: 0,
    resetTime: limitData.resetTime
  };
}

/**
 * Get client IP from Netlify request
 */
export function getClientIP(event) {
  return event.headers['x-nf-client-connection-ip'] || 
         event.headers['x-forwarded-for']?.split(',')[0] ||
         'unknown';
}

/**
 * Create rate limit response
 */
export function rateLimitResponse(resetTime) {
  return {
    statusCode: 429,
    headers: {
      'Content-Type': 'application/json',
      'Retry-After': Math.ceil((resetTime - Date.now()) / 1000).toString(),
      'X-RateLimit-Limit': '100',
      'X-RateLimit-Remaining': '0',
      'X-RateLimit-Reset': new Date(resetTime).toISOString()
    },
    body: JSON.stringify({
      error: 'Too Many Requests',
      message: 'Rate limit exceeded. Please try again later.',
      retryAfter: Math.ceil((resetTime - Date.now()) / 1000)
    })
  };
}

/**
 * Wrapper to add rate limiting to any Netlify function
 */
export function withRateLimit(handler, maxRequests = 100, windowMs = 60000) {
  return async (event, context) => {
    const clientIP = getClientIP(event);
    const { allowed, remaining, resetTime } = checkRateLimit(clientIP, maxRequests, windowMs);
    
    if (!allowed) {
      return rateLimitResponse(resetTime);
    }
    
    // Add rate limit headers to response
    const response = await handler(event, context);
    
    return {
      ...response,
      headers: {
        ...response.headers,
        'X-RateLimit-Limit': maxRequests.toString(),
        'X-RateLimit-Remaining': remaining.toString(),
        'X-RateLimit-Reset': new Date(resetTime).toISOString()
      }
    };
  };
}
