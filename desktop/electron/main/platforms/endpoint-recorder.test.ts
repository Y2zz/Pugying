import type { Session } from 'electron';
import { getRecordedEndpoints, recordJsonEndpoints } from './endpoint-recorder';

/**
 * Details shape passed to the webRequest.onCompleted listener; only the
 * fields the recorder reads.
 */
interface CompletedDetails {
  url: string;
  method: string;
  statusCode: number;
  resourceType: string;
  responseHeaders?: Record<string, string[]>;
}

type CompletedListener = (details: CompletedDetails) => void;

/** Minimal session double: captures the onCompleted listener for replay. */
function makeRecordingSession(): {
  session: Session;
  emit: CompletedListener;
} {
  let listener: CompletedListener = () => undefined;
  const fake = {
    webRequest: {
      onCompleted: (_filter: unknown, cb: CompletedListener) => {
        listener = cb;
      },
    },
  };
  return {
    session: fake as unknown as Session,
    emit: (details) => listener(details),
  };
}

function jsonGet(url: string, extra?: Partial<CompletedDetails>): CompletedDetails {
  return {
    url,
    method: 'GET',
    statusCode: 200,
    resourceType: 'xhr',
    responseHeaders: { 'Content-Type': ['application/json; charset=utf-8'] },
    ...extra,
  };
}

const DOMAINS = ['.example.com', 'example.com'];

describe('recordJsonEndpoints', () => {
  it('records successful JSON GETs on the platform domains', () => {
    const { session, emit } = makeRecordingSession();
    recordJsonEndpoints(session, DOMAINS);
    emit(jsonGet('https://api.example.com/user/info'));
    expect(getRecordedEndpoints(session)).toEqual([
      'https://api.example.com/user/info',
    ]);
  });

  it('deduplicates repeated URLs', () => {
    const { session, emit } = makeRecordingSession();
    recordJsonEndpoints(session, DOMAINS);
    emit(jsonGet('https://api.example.com/user/info'));
    emit(jsonGet('https://api.example.com/user/info'));
    expect(getRecordedEndpoints(session)).toHaveLength(1);
  });

  it('ignores non-GET requests', () => {
    const { session, emit } = makeRecordingSession();
    recordJsonEndpoints(session, DOMAINS);
    emit(jsonGet('https://api.example.com/a', { method: 'POST' }));
    expect(getRecordedEndpoints(session)).toEqual([]);
  });

  it('ignores non-200 responses', () => {
    const { session, emit } = makeRecordingSession();
    recordJsonEndpoints(session, DOMAINS);
    emit(jsonGet('https://api.example.com/a', { statusCode: 302 }));
    expect(getRecordedEndpoints(session)).toEqual([]);
  });

  it('ignores clearly non-API resource types', () => {
    const { session, emit } = makeRecordingSession();
    recordJsonEndpoints(session, DOMAINS);
    for (const resourceType of ['mainFrame', 'script', 'image', 'stylesheet']) {
      emit(jsonGet(`https://api.example.com/${resourceType}`, { resourceType }));
    }
    expect(getRecordedEndpoints(session)).toEqual([]);
  });

  it('ignores hosts outside the cookie domains', () => {
    const { session, emit } = makeRecordingSession();
    recordJsonEndpoints(session, DOMAINS);
    emit(jsonGet('https://api.other.com/user/info'));
    emit(jsonGet('https://evil-example.com/user/info'));
    expect(getRecordedEndpoints(session)).toEqual([]);
  });

  it('accepts subdomains of a dotted cookie domain', () => {
    const { session, emit } = makeRecordingSession();
    recordJsonEndpoints(session, ['.example.com']);
    emit(jsonGet('https://deep.api.example.com/me'));
    expect(getRecordedEndpoints(session)).toEqual([
      'https://deep.api.example.com/me',
    ]);
  });

  it('requires a JSON content type, matched case-insensitively', () => {
    const { session, emit } = makeRecordingSession();
    recordJsonEndpoints(session, DOMAINS);
    emit(
      jsonGet('https://api.example.com/html', {
        responseHeaders: { 'content-type': ['text/html'] },
      }),
    );
    emit(
      jsonGet('https://api.example.com/nohdr', { responseHeaders: undefined }),
    );
    emit(
      jsonGet('https://api.example.com/upper', {
        responseHeaders: { 'CONTENT-TYPE': ['Application/JSON'] },
      }),
    );
    expect(getRecordedEndpoints(session)).toEqual([
      'https://api.example.com/upper',
    ]);
  });

  it('caps the recording at 300 URLs per session', () => {
    const { session, emit } = makeRecordingSession();
    recordJsonEndpoints(session, DOMAINS);
    for (let i = 0; i < 310; i += 1) {
      emit(jsonGet(`https://api.example.com/u/${i}`));
    }
    expect(getRecordedEndpoints(session)).toHaveLength(300);
  });
});

describe('getRecordedEndpoints', () => {
  it('returns an empty list for a session that never recorded', () => {
    const { session } = makeRecordingSession();
    expect(getRecordedEndpoints(session)).toEqual([]);
  });
});
