const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

// Simple in-memory rate limiter
const rateLimits = new Map();

function checkRateLimit(ip, maxRequests = 100, windowMs = 60000) {
  const now = Date.now();
  const key = `limit:${ip}`;
  
  let limitData = rateLimits.get(key);
  
  if (!limitData || now - limitData.resetTime > windowMs) {
    limitData = { count: 1, resetTime: now + windowMs };
    rateLimits.set(key, limitData);
    return { allowed: true, remaining: maxRequests - 1, resetTime: limitData.resetTime };
  }
  
  if (limitData.count < maxRequests) {
    limitData.count++;
    return { allowed: true, remaining: maxRequests - limitData.count, resetTime: limitData.resetTime };
  }
  
  return { allowed: false, remaining: 0, resetTime: limitData.resetTime };
}

exports.handler = async (event, context) => {
  // Get client IP
  const clientIP = event.headers['x-nf-client-connection-ip'] || 
                   event.headers['x-forwarded-for']?.split(',')[0] ||
                   'unknown';

  // Check rate limit
  const { allowed, remaining, resetTime } = checkRateLimit(clientIP);
  
  if (!allowed) {
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

  // Only allow GET requests
  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Method Not Allowed' })
    };
  }

  try {
    // Fetch pets with shelter information
    const { data: pets, error } = await supabase
      .from('pets')
      .select(`
        *,
        shelter:shelters (
          name,
          phone,
          address,
          email
        )
      `)
      .eq('status', 'available')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Supabase error:', error);
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          error: 'Failed to fetch pets',
          message: 'Database error occurred'
        })
      };
    }

    // Transform data for frontend
    const transformedPets = pets.map(pet => ({
      id: pet.id,
      name: pet.name,
      type: pet.type,
      breed: pet.breed,
      age: pet.age,
      size: pet.size,
      description: pet.description,
      traits: pet.traits || [],
      image: pet.image_url,
      image_url: pet.image_url,
      distance: `${pet.distance} miles`,
      fee: `$${pet.adoption_fee}`,
      adoption_fee: pet.adoption_fee,
      status: pet.status,
      shelter: pet.shelter?.name || 'Unknown Shelter',
      phone: pet.shelter?.phone || '',
      address: pet.shelter?.address || '',
      email: pet.shelter?.email || ''
    }));

    return {
      statusCode: 200,
      headers: { 
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=300',
        'X-RateLimit-Limit': '100',
        'X-RateLimit-Remaining': remaining.toString(),
        'X-RateLimit-Reset': new Date(resetTime).toISOString()
      },
      body: JSON.stringify(transformedPets)
    };

  } catch (error) {
    console.error('Unexpected error:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        error: 'Internal Server Error',
        message: 'An unexpected error occurred'
      })
    };
  }
};
