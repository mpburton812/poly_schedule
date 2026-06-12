import { GCAL_CONFIG_SUMMARY, googleApiErrorFromResponse } from './gcal-sync.js';

export const CalendarAPI = {
  async fetchEventItems({ calendarId, apiKey, accessToken, daysBack = 30, daysForward = 60 }) {
    const timeMin = new Date();
    timeMin.setDate(timeMin.getDate() - daysBack);
    const timeMax = new Date();
    timeMax.setDate(timeMax.getDate() + daysForward);

    const items = [];
    let pageToken = null;

    do {
      const params = new URLSearchParams({
        timeMin: timeMin.toISOString(),
        timeMax: timeMax.toISOString(),
        singleEvents: 'true',
        key: apiKey
      });
      if (pageToken) params.set('pageToken', pageToken);

      const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${params}`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });

      if (!res.ok) throw await googleApiErrorFromResponse(res, 'Failed to fetch calendar events from Google Calendar API');

      const data = await res.json();
      items.push(...(data.items || []));
      pageToken = data.nextPageToken || null;
    } while (pageToken);

    return items;
  },

  async createEvent({ calendarId, apiKey, accessToken, resource }) {
    const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?key=${apiKey}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(resource)
    });

    if (!res.ok) throw await googleApiErrorFromResponse(res, 'Failed to create calendar event on Google Calendar');
    return await res.json();
  },

  async updateEvent({ calendarId, apiKey, accessToken, eventId, resource }) {
    const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${eventId}?key=${apiKey}`;
    const res = await fetch(url, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(resource)
    });

    if (!res.ok) {
      if (res.status === 404) return null; // Let caller handle recreate
      throw await googleApiErrorFromResponse(res, 'Failed to update calendar event on Google Calendar');
    }
    return await res.json();
  },

  async deleteEvent({ calendarId, apiKey, accessToken, eventId }) {
    const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${eventId}?key=${apiKey}`;
    const res = await fetch(url, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    if (res.status === 404 || res.status === 410) return;
    if (!res.ok) throw await googleApiErrorFromResponse(res, 'Failed to delete calendar event from Google Calendar');
  },

  async findConfigEvent({ calendarId, apiKey, accessToken }) {
    const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?q=${encodeURIComponent(GCAL_CONFIG_SUMMARY)}&key=${apiKey}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (!res.ok) return null;
    const data = await res.json();
    return (data.items || []).find(item => item.summary === GCAL_CONFIG_SUMMARY);
  },

  async saveConfigEvent({ calendarId, apiKey, accessToken, configData, configEventId }) {
    const cleanConfig = JSON.parse(JSON.stringify(configData));
    if (cleanConfig.partners) {
      cleanConfig.partners.forEach(p => {
        delete p.password; // Strip passwords before sync
      });
    }

    const resource = {
      summary: GCAL_CONFIG_SUMMARY,
      description: JSON.stringify(cleanConfig, null, 2),
      start: { date: '2026-01-01' },
      end: { date: '2026-01-02' },
      recurrence: ['RRULE:FREQ=DAILY;COUNT=1']
    };

    let url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?key=${apiKey}`;
    let method = 'POST';

    if (configEventId) {
      url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${configEventId}?key=${apiKey}`;
      method = 'PUT';
    }

    const res = await fetch(url, {
      method,
      mode: 'cors',
      credentials: 'omit',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(resource),
      referrer: '',
      referrerPolicy: 'no-referrer'
    });

    if (!res.ok) throw await googleApiErrorFromResponse(res, 'Failed to save configuration settings to Google Calendar');
  }
};
