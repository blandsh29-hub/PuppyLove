import { createClient } from '@supabase/supabase-js';
import { withRateLimit } from './rateLimit.js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function handler(event, context) {
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
        'Cache-Control': 'public, max-age=300' // Cache for 5 minutes
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
}

// Export with rate limiting: 100 requests per minute per IP
export const handler = withRateLimit(handler, 100, 60000);
