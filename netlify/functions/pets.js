// netlify/functions/pets.js
// API endpoint for fetching pets with filters

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

exports.handler = async (event, context) => {
  // CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  // Handle preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    const { species, size, age } = event.queryStringParameters || {};
    
    let query = supabase
      .from('pets')
      .select(`
        *,
        shelters (
          name,
          phone,
          address,
          city,
          state
        )
      `)
      .eq('status', 'available')
      .order('created_at', { ascending: false });

    // Apply filters
    if (species) {
      query = query.eq('type', species.toLowerCase());
    }

    if (size) {
      query = query.eq('size', size.toLowerCase());
    }

    if (age) {
      if (age === 'young') {
        query = query.lte('age', 2);
      } else if (age === 'adult') {
        query = query.gte('age', 2).lte('age', 7);
      } else if (age === 'senior') {
        query = query.gt('age', 7);
      }
    }

    const { data, error } = await query;

    if (error) throw error;

    // Transform data to match frontend format
    const pets = data.map(pet => ({
      id: pet.id,
      name: pet.name,
      type: pet.type,
      breed: pet.breed,
      age: pet.age,
      size: pet.size,
      distance: `${pet.distance} miles`,
      image: pet.image_url,
      description: pet.description,
      traits: pet.traits,
      shelter: pet.shelters.name,
      phone: pet.shelters.phone,
      address: `${pet.shelters.address}, ${pet.shelters.city}, ${pet.shelters.state}`,
      fee: `$${pet.adoption_fee}`
    }));

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(pets)
    };

  } catch (error) {
    console.error('Error fetching pets:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Failed to fetch pets', message: error.message })
    };
  }
};
