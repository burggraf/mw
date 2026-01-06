import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SendInvitationRequest {
  invitationId: string;
  language?: 'en' | 'es';
}

// Email translations
const translations = {
  en: {
    subject: (churchName: string) => `You've been invited to join ${churchName} on Mobile Worship`,
    title: 'Mobile Worship',
    heading: "You're Invited!",
    message: (inviterName: string, churchName: string, article: string, role: string) =>
      `<strong>${inviterName}</strong> has invited you to join <strong>${churchName}</strong> on Mobile Worship as ${article} <strong>${role}</strong>.`,
    button: 'Accept Invitation',
    expires: (date: string) => `This invitation expires on ${date}.`,
    ignore: "If you didn't expect this invitation, you can safely ignore this email.",
    tagline: 'Mobile Worship - Worship lyrics display for churches',
    textMessage: (inviterName: string, churchName: string, article: string, role: string) =>
      `${inviterName} has invited you to join ${churchName} on Mobile Worship as ${article} ${role}.`,
    textAccept: 'Accept your invitation by visiting:',
    textExpires: (date: string) => `This invitation expires on ${date}.`,
  },
  es: {
    subject: (churchName: string) => `Has sido invitado a unirte a ${churchName} en Mobile Worship`,
    title: 'Mobile Worship',
    heading: '¡Estás Invitado!',
    message: (inviterName: string, churchName: string, _article: string, role: string) =>
      `<strong>${inviterName}</strong> te ha invitado a unirte a <strong>${churchName}</strong> en Mobile Worship como <strong>${role}</strong>.`,
    button: 'Aceptar Invitación',
    expires: (date: string) => `Esta invitación expira el ${date}.`,
    ignore: 'Si no esperabas esta invitación, puedes ignorar este correo.',
    tagline: 'Mobile Worship - Letras de adoración para iglesias',
    textMessage: (inviterName: string, churchName: string, _article: string, role: string) =>
      `${inviterName} te ha invitado a unirte a ${churchName} en Mobile Worship como ${role}.`,
    textAccept: 'Acepta tu invitación visitando:',
    textExpires: (date: string) => `Esta invitación expira el ${date}.`,
  },
};

const roleNames = {
  en: { admin: 'Admin', editor: 'Editor', operator: 'Operator' },
  es: { admin: 'Administrador', editor: 'Editor', operator: 'Operador' },
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    const appUrl = Deno.env.get('APP_URL') || 'http://localhost:5173';

    console.log('send-invitation called, RESEND_API_KEY configured:', !!resendApiKey);

    if (!resendApiKey) {
      console.log('RESEND_API_KEY not configured, skipping email send');
      return new Response(
        JSON.stringify({ success: true, message: 'Email sending not configured' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify the user is authenticated and authorized
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Authorization required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const userClient = createClient(
      supabaseUrl,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user: authUser }, error: authError } = await userClient.auth.getUser();
    if (authError || !authUser) {
      console.log('Auth error:', authError);
      return new Response(
        JSON.stringify({ error: 'Authentication failed' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const body: SendInvitationRequest = await req.json();
    const { invitationId, language = 'en' } = body;
    const lang = language === 'es' ? 'es' : 'en';
    const t = translations[lang];
    const roles = roleNames[lang];

    console.log('Processing invitation:', invitationId, 'language:', lang);

    if (!invitationId) {
      return new Response(
        JSON.stringify({ error: 'invitationId is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch the invitation (without JOINs to avoid foreign key issues)
    const { data: invitation, error: inviteError } = await supabase
      .from('invitations')
      .select('id, email, role, token, expires_at, church_id, invited_by')
      .eq('id', invitationId)
      .single();

    if (inviteError || !invitation) {
      console.log('Invitation not found:', inviteError);
      return new Response(
        JSON.stringify({ error: 'Invitation not found', details: inviteError?.message }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Found invitation for:', invitation.email);

    // Fetch church name separately
    let churchName = lang === 'es' ? 'tu iglesia' : 'your church';
    if (invitation.church_id) {
      const { data: church } = await supabase
        .from('churches')
        .select('name')
        .eq('id', invitation.church_id)
        .single();
      if (church?.name) churchName = church.name;
    }

    // Fetch inviter name separately
    let inviterName = lang === 'es' ? 'Un miembro del equipo' : 'A team member';
    if (invitation.invited_by) {
      const { data: inviter } = await supabase
        .from('user_profiles')
        .select('display_name')
        .eq('id', invitation.invited_by)
        .single();
      if (inviter?.display_name) inviterName = inviter.display_name;
    }

    // Verify the requesting user is from the same church
    const { data: membership } = await supabase
      .from('user_church_memberships')
      .select('role')
      .eq('user_id', authUser.id)
      .eq('church_id', invitation.church_id)
      .single();

    if (!membership || membership.role !== 'admin') {
      console.log('User is not admin:', membership?.role);
      return new Response(
        JSON.stringify({ error: 'Only admins can send invitations' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const acceptUrl = `${appUrl}/accept-invite?token=${invitation.token}`;
    const expiresDate = new Date(invitation.expires_at).toLocaleDateString(lang === 'es' ? 'es-ES' : 'en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
    const roleName = roles[invitation.role as keyof typeof roles] || invitation.role;
    const article = lang === 'en' ? (invitation.role === 'admin' ? 'an' : 'a') : '';

    console.log('Sending email to:', invitation.email, 'from app:', appUrl);

    // Send email via Resend
    const emailResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${resendApiKey}`,
      },
      body: JSON.stringify({
        from: 'Mobile Worship <noreply@mobileworship.com>',
        to: [invitation.email],
        subject: t.subject(churchName),
        html: `
          <!DOCTYPE html>
          <html lang="${lang}">
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
          </head>
          <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="text-align: center; margin-bottom: 30px;">
              <h1 style="color: #1a1a1a; margin-bottom: 10px;">${t.title}</h1>
            </div>

            <div style="background-color: #f9fafb; border-radius: 8px; padding: 30px; margin-bottom: 20px;">
              <h2 style="color: #1a1a1a; margin-top: 0;">${t.heading}</h2>
              <p style="margin-bottom: 20px;">
                ${t.message(inviterName, churchName, article, roleName)}
              </p>

              <div style="text-align: center; margin: 30px 0;">
                <a href="${acceptUrl}" style="display: inline-block; background-color: #2563eb; color: white; text-decoration: none; padding: 14px 28px; border-radius: 6px; font-weight: 600;">
                  ${t.button}
                </a>
              </div>

              <p style="color: #666; font-size: 14px; margin-bottom: 0;">
                ${t.expires(expiresDate)}
              </p>
            </div>

            <div style="text-align: center; color: #888; font-size: 12px;">
              <p>
                ${t.ignore}
              </p>
              <p>
                ${t.tagline}
              </p>
            </div>
          </body>
          </html>
        `,
        text: `
${t.heading}

${t.textMessage(inviterName, churchName, article, roleName)}

${t.textAccept}
${acceptUrl}

${t.textExpires(expiresDate)}

${t.ignore}

${t.tagline}
        `.trim(),
      }),
    });

    if (!emailResponse.ok) {
      const errorData = await emailResponse.text();
      console.error('Resend API error:', errorData);
      return new Response(
        JSON.stringify({ error: 'Failed to send email', details: errorData }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const emailResult = await emailResponse.json();
    console.log('Email sent successfully:', emailResult.id);

    return new Response(
      JSON.stringify({ success: true, emailId: emailResult.id }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
