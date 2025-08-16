//src/pages/index.tsx
//src/pages/index.tsx
import { useState, useRef, useEffect, useCallback } from 'react';
import io, { Socket } from 'socket.io-client';

type SignalData = {
  type: 'offer' | 'answer' | 'candidate';
  offer?: RTCSessionDescriptionInit;
  answer?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
};

export default function WebRTCPage() {
  const [roomId, setRoomId] = useState('');
  const [status, setStatus] = useState('Idle');
  const [joined, setJoined] = useState(false);

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);

  const socketRef = useRef<typeof Socket | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);

  // Initialize socket connection
  useEffect(() => {
    // socketRef.current = io({
    //   //path: '/api/socket.io',
    //   path: 'https://peer.agregartech.com/',
    // });
    socketRef.current = io('https://peer.agregartech.com/', {
      path: '/socket.io',
      transports: ['websocket']
    });

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, []);

  // Set up socket event listeners
  useEffect(() => {
    if (!socketRef.current) return;

    const socket = socketRef.current;

    // const socket = io('https://peer.agregartech.com/', {
    //   path: '/socket.io',
    //   transports: ['websocket']
    // });

    socket.on('peers-in-room', ({ peers }: { peers: string[] }) => {
      setStatus(`Joined room. Peers here: ${peers.length}`);
    });

    socket.on('peer-joined', ({ socketId }: { socketId: string }) => {
      setStatus(`Peer joined: ${socketId}. Click "Start Call" to call.`);
    });

    socket.on('peer-left', ({ socketId }: { socketId: string }) => {
      setStatus(`Peer left: ${socketId}`);
      // Clean up peer connection if needed
      if (pcRef.current) {
        pcRef.current.close();
        pcRef.current = null;
      }
      if (remoteStreamRef.current) {
        remoteStreamRef.current = null;
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = null;
        }
      }
    });

    socket.on('signal', async ({ from, data }: { from: string; data: SignalData }) => {
      console.log('Received signal:', data.type, 'from:', from);

      if (!pcRef.current) {
        pcRef.current = createPeerConnection();
      }

      const pc = pcRef.current;

      try {
        switch (data.type) {
          case 'offer':
            console.log('Processing offer...');
            await ensureLocalStream();

            // Set remote description first
            if (data.offer) {
              await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
            } else {
              console.error('Received offer without offer data');
              setStatus('Error: Invalid offer received');
              return;
            }

            // Add local tracks after setting remote description
            if (localStreamRef.current) {
              localStreamRef.current.getTracks().forEach(track => {
                const sender = pc.getSenders().find(s => s.track?.kind === track.kind);
                if (!sender) {
                  pc.addTrack(track, localStreamRef.current!);
                }
              });
            }

            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);

            socket.emit('signal', {
              roomId,
              to: from,
              data: { type: 'answer', answer }
            });
            setStatus('Answer sent.');
            break;

          case 'answer':
            console.log('Processing answer...');
            if (data.answer) {
              await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
              setStatus('Answer received. Connection establishing...');
            }
            break;

          case 'candidate':
            console.log('Processing ICE candidate...');
            if (data.candidate) {
              await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
            }
            break;
        }
      } catch (err) {
        console.error('Error handling signal:', err);
        setStatus(`Error during signaling: ${(err as Error).message}`);
      }
    });

    return () => {
      socket.off('peers-in-room');
      socket.off('peer-joined');
      socket.off('peer-left');
      socket.off('signal');
    };
  }, [roomId]);

  // Create peer connection
  const createPeerConnection = useCallback((): RTCPeerConnection => {
    console.log('Creating new peer connection...');

    // const pc = new RTCPeerConnection({
    //   iceServers: [
    //     { urls: 'stun:stun.l.google.com:19302' },
    //     { urls: 'stun:stun1.l.google.com:19302' },
    //   ],
    //   iceCandidatePoolSize: 10,
    // });

    const pcConfig = {
      iceServers: [
        {
          urls: [
            'stun:stun.l.google.com:19302',
            'stun:stun1.l.google.com:19302',
            'stun:stun2.l.google.com:19302'
          ]
        }
      ]
    };

    const pc = new RTCPeerConnection(pcConfig);


    pc.onicecandidate = (e) => {
      if (e.candidate && roomId && socketRef.current) {
        console.log('Sending ICE candidate');
        socketRef.current.emit('signal', {
          roomId,
          to: null,
          data: { type: 'candidate', candidate: e.candidate.toJSON() }
        });
      }
    };

    pc.ontrack = (e) => {
      console.log("Received tracks:", e.streams.length, "streams");

      if (!e.streams || e.streams.length === 0) {
        console.log("No streams in track event");
        return;
      }

      const [remoteStream] = e.streams;
      console.log("Remote stream tracks:", remoteStream.getTracks().length);

      if (remoteStreamRef.current !== remoteStream) {
        remoteStreamRef.current = remoteStream;

        if (remoteVideoRef.current && remoteVideoRef.current.srcObject !== remoteStream) {
          remoteVideoRef.current.srcObject = remoteStream;

          const playPromise = remoteVideoRef.current.play();
          if (playPromise !== undefined) {
            playPromise
              .then(() => {
                console.log("Remote video started playing");
                setStatus('Connected - Remote video playing');
              })
              .catch(err => {
                if ((err as Error).name === 'AbortError') {
                  console.log("Remote video play interrupted (normal during setup)");
                  setTimeout(() => {
                    if (remoteVideoRef.current && !remoteVideoRef.current.paused) {
                      return;
                    }
                    remoteVideoRef.current?.play().catch(() => {
                      setStatus('Connected - Click video to play');
                    });
                  }, 100);
                } else {
                  console.log("Remote video playback prevented:", err);
                  setStatus('Connected - Click video to play');
                }
              });
          }
        }
      }
    };

    pc.oniceconnectionstatechange = () => {
      console.log('ICE connection state:', pc.iceConnectionState);
      setStatus(`ICE connection: ${pc.iceConnectionState}`);

      if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
        setStatus('Connected successfully!');
      } else if (pc.iceConnectionState === 'failed') {
        setStatus('Connection failed - retrying...');
        pc.restartIce();
      } else if (pc.iceConnectionState === 'disconnected') {
        setStatus('Connection lost');
      }
    };

    pc.onconnectionstatechange = () => {
      console.log('Connection state:', pc.connectionState);
    };

    pc.onicegatheringstatechange = () => {
      console.log('ICE gathering state:', pc.iceGatheringState);
    };

    pc.onnegotiationneeded = () => {
      console.log('Negotiation needed - ignoring automatic negotiation');
    };

    return pc;
  }, [roomId]);

  const ensureLocalStream = async (): Promise<MediaStream> => {
    if (!localStreamRef.current) {
      try {
        console.log('Requesting local media...');
        localStreamRef.current = await navigator.mediaDevices.getUserMedia({
          video: { width: 1280, height: 720 },
          audio: true
        });

        if (localVideoRef.current && localVideoRef.current.srcObject !== localStreamRef.current) {
          localVideoRef.current.srcObject = localStreamRef.current;
          try {
            await localVideoRef.current.play();
          } catch (playError) {
            if ((playError as Error).name === 'AbortError') {
              console.log('Local video play interrupted (normal during setup)');
            } else {
              console.warn('Local video play error:', playError);
            }
          }
        }

        console.log('Local media obtained:', localStreamRef.current.getTracks().length, 'tracks');
      } catch (err) {
        console.error("Failed to get local media:", err);
        setStatus("Error accessing camera/microphone");
        throw err;
      }
    }
    return localStreamRef.current;
  };

  const generateRoomId = () => {
    setRoomId(crypto.randomUUID().slice(0, 8));
  };

  const joinRoom = async () => {
    if (!roomId.trim()) {
      alert('Enter or generate a Room ID first.');
      return;
    }

    try {
      if (socketRef.current) {
        socketRef.current.emit('join', { roomId: roomId.trim() });
        setJoined(true);
        setStatus(`Joined room ${roomId}. Share this ID with your peer.`);
        await ensureLocalStream();
      }
    } catch (error) {
      console.error('Error joining room:', error);
      setStatus('Error joining room');
    }
  };

  const leaveRoom = () => {
    if (!joined) return;

    if (socketRef.current) {
      socketRef.current.emit('leave', { roomId });
    }

    setJoined(false);
    setStatus('Left room.');

    // Cleanup peer connection
    if (pcRef.current) {
      pcRef.current.onicecandidate = null;
      pcRef.current.ontrack = null;
      pcRef.current.oniceconnectionstatechange = null;
      pcRef.current.onconnectionstatechange = null;
      pcRef.current.close();
      pcRef.current = null;
    }

    // Cleanup streams
    if (remoteStreamRef.current) {
      remoteStreamRef.current = null;
    }

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
      localStreamRef.current = null;
    }

    // Cleanup video elements
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
    }
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null;
    }
  };

  const startCall = async () => {
    if (!joined) {
      alert('Join a room first.');
      return;
    }

    try {
      console.log('Starting call...');
      await ensureLocalStream();

      // Create new peer connection if needed
      if (!pcRef.current) {
        pcRef.current = createPeerConnection();
      }

      const pc = pcRef.current;

      // Add local tracks
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => {
          const sender = pc.getSenders().find(s => s.track?.kind === track.kind);
          if (!sender) {
            console.log('Adding track:', track.kind);
            pc.addTrack(track, localStreamRef.current!);
          }
        });
      }

      console.log('Creating offer...');
      const offer = await pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true,
      });

      await pc.setLocalDescription(offer);

      if (socketRef.current) {
        socketRef.current.emit('signal', {
          roomId,
          to: null,
          data: { type: 'offer', offer }
        });
      }

      setStatus('Offer sent. Waiting for answer…');
    } catch (err) {
      console.error('Error starting call:', err);
      setStatus(`Error starting call: ${(err as Error).message}`);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-6xl mx-auto">
        <div className="bg-white rounded-xl shadow-lg overflow-hidden">
          {/* Header */}
          <div className="bg-[#245C94] px-6 py-4">
            <h1 className="text-2xl font-bold text-white">Video Call App</h1>
          </div>

          {/* Main Content */}
          <div className="p-6">
            {/* Control Panel */}
            <div className="mb-8">
              <div className="flex flex-col space-y-4">
                <div className="flex items-center space-x-3">
                  <input
                    type="text"
                    value={roomId}
                    onChange={(e) => setRoomId(e.target.value)}
                    placeholder="Enter or generate Room ID"
                    className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#245C94] focus:border-transparent"
                  />
                  <button
                    onClick={generateRoomId}
                    className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-gray-400"
                  >
                    Generate
                  </button>
                </div>

                <div className="flex items-center space-x-3">
                  <button
                    onClick={joinRoom}
                    disabled={joined}
                    className={`px-5 py-2 rounded-lg font-medium transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-[#245C94] focus:ring-offset-2 ${joined
                      ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
                      : 'bg-[#245C94] text-white hover:bg-[#1a4a7a]'
                      }`}
                  >
                    Join Room
                  </button>
                  <button
                    onClick={leaveRoom}
                    disabled={!joined}
                    className={`px-5 py-2 rounded-lg font-medium transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 ${!joined
                      ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
                      : 'bg-red-500 text-white hover:bg-red-600'
                      }`}
                  >
                    Leave Room
                  </button>
                  <button
                    onClick={startCall}
                    disabled={!joined}
                    className={`px-5 py-2 rounded-lg font-medium transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 ${!joined
                      ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
                      : 'bg-green-600 text-white hover:bg-green-700'
                      }`}
                  >
                    Start Call
                  </button>
                </div>

                <div className="bg-blue-50 border-l-4 border-[#245C94] px-4 py-3">
                  <p className="text-sm text-gray-700 font-medium">{status}</p>
                </div>
              </div>
            </div>

            {/* Video Section */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-gray-100 rounded-xl overflow-hidden">
                <div className="bg-[#245C94] px-4 py-2">
                  <h2 className="text-lg font-semibold text-white">Local Video</h2>
                </div>
                <video
                  ref={localVideoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-64 md:h-96 object-cover"
                />
              </div>

              <div className="bg-gray-100 rounded-xl overflow-hidden relative">
                <div className="bg-[#245C94] px-4 py-2">
                  <h2 className="text-lg font-semibold text-white">Remote Video</h2>
                </div>
                <video
                  ref={remoteVideoRef}
                  autoPlay
                  playsInline
                  className="w-full h-64 md:h-96 object-cover"
                />
                {!remoteStreamRef.current && (
                  <div className="absolute inset-0 flex items-center justify-center bg-gray-800 bg-opacity-50">
                    <div className="text-center p-6 bg-white bg-opacity-90 rounded-lg">
                      <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-[#245C94] mx-auto mb-3"></div>
                      <p className="text-gray-700 font-medium">Waiting for remote connection...</p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Debug Info - Collapsible */}
            <details className="mt-8 border border-gray-200 rounded-lg overflow-hidden">
              <summary className="bg-gray-100 px-4 py-3 cursor-pointer font-medium text-gray-700 focus:outline-none">
                Connection Details
              </summary>
              <div className="bg-white p-4 text-sm grid grid-cols-2 md:grid-cols-3 gap-4">
                <div>
                  <p className="text-gray-500">Room ID</p>
                  <p className="font-mono">{roomId || 'None'}</p>
                </div>
                <div>
                  <p className="text-gray-500">Joined</p>
                  <p>{joined ? 'Yes' : 'No'}</p>
                </div>
                <div>
                  <p className="text-gray-500">Local Stream</p>
                  <p>{localStreamRef.current ? `${localStreamRef.current.getTracks().length} tracks` : 'None'}</p>
                </div>
                <div>
                  <p className="text-gray-500">Remote Stream</p>
                  <p>{remoteStreamRef.current ? `${remoteStreamRef.current.getTracks().length} tracks` : 'None'}</p>
                </div>
                <div>
                  <p className="text-gray-500">Peer Connection</p>
                  <p>{pcRef.current ? pcRef.current.connectionState : 'None'}</p>
                </div>
              </div>
            </details>
          </div>
        </div>
      </div>
    </div>
  );
}
