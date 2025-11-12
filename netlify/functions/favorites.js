// netlify/functions/favorites.js
// API endpoint for managing user favorites

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

exports.handler = async (event, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    // Get user from auth header
    const authHeader = event.headers.authorization;
    if (!authHeader) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ error: 'Unauthorized' })
      };
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ error: 'Invalid token' })
      };
    }

    // GET - Fetch user's favorites
    if (event.httpMethod === 'GET') {
      const { data, error } = await supabase
        .from('favorites')
        .select(`
          *,
          pets (*)
        `)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const favorites = data.map(fav => ({
        ...fav.pets,
        favoriteId: fav.id,
        mode: fav.mode
      }));

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify(favorites)
      };
    }

    // POST - Add to favorites
    if (event.httpMethod === 'POST') {
      const { petId, mode } = JSON.parse(event.body);

      const { data, error } = await supabase
        .from('favorites')
        .insert({
          user_id: user.id,
          pet_id: petId,
          mode: mode || 'adopt'
        })
        .select()
        .single();

      if (error) {
        if (error.code === '23505') { // Unique constraint violation
          return {
            statusCode: 409,
            headers,
            body: JSON.stringify({ error: 'Already in favorites' })
          };
        }
        throw error;
      }

      return {
        statusCode: 201,
        headers,
        body: JSON.stringify(data)
      };
    }

    // DELETE - Remove from favorites
    if (event.httpMethod === 'DELETE') {
      const petId = event.path.split('/').pop();

      const { error } = await supabase
        .from('favorites')
        .delete()
        .eq('user_id', user.id)
        .eq('pet_id', petId);

      if (error) throw error;

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ message: 'Removed from favorites' })
      };
    }

    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' })
    };

  } catch (error) {
    console.error('Error in favorites:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Internal server error', message: error.message })
    };
  }
};
