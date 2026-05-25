import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { Copy, Eye, EyeOff, Trash2, Plus, AlertCircle, CheckCircle } from 'lucide-react';

interface ApiKey {
  id: string;
  key_prefix: string;
  name: string;
  active: boolean;
  last_used_at?: string;
  created_at: string;
}

export default function ApiKeysManager() {
  const { user } = useAuth();
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [newKeyName, setNewKeyName] = useState('');
  const [generatingKey, setGeneratingKey] = useState(false);
  const [generatedKey, setGeneratedKey] = useState<string | null>(null);
  const [showKey, setShowKey] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (user) loadApiKeys();
  }, [user]);

  const loadApiKeys = async () => {
    setLoading(true);
    try {
      const { data, error: err } = await supabase
        .from('api_keys')
        .select('id, key_prefix, name, active, last_used_at, created_at')
        .eq('user_id', user?.id)
        .order('created_at', { ascending: false });

      if (err) throw err;
      setApiKeys(data || []);
    } catch (err) {
      setError('Erreur lors du chargement des clés');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const generateNewKey = async () => {
    if (!newKeyName.trim()) {
      setError('Nom de la clé requis');
      return;
    }

    setGeneratingKey(true);
    setError('');

    try {
      const keyPart1 = 'sk_live_' + generateRandomString(20);
      const keyPart2 = generateRandomString(20);
      const fullKey = keyPart1 + keyPart2;

      const keyHash = await hashKey(fullKey);
      const keyPrefix = fullKey.substring(0, 8);

      const { error: err } = await supabase.from('api_keys').insert({
        user_id: user?.id,
        key_hash: keyHash,
        key_prefix: keyPrefix,
        name: newKeyName,
        active: true,
      });

      if (err) throw err;

      setGeneratedKey(fullKey);
      setNewKeyName('');
      await loadApiKeys();
    } catch (err) {
      setError('Erreur lors de la création de la clé');
      console.error(err);
    } finally {
      setGeneratingKey(false);
    }
  };

  const toggleKeyStatus = async (keyId: string, currentStatus: boolean) => {
    try {
      const { error: err } = await supabase
        .from('api_keys')
        .update({ active: !currentStatus })
        .eq('id', keyId);

      if (err) throw err;
      await loadApiKeys();
    } catch (err) {
      setError('Erreur lors de la mise à jour');
      console.error(err);
    }
  };

  const deleteKey = async (keyId: string) => {
    if (!confirm('Êtes-vous sûr? Cette action est irréversible.')) return;

    try {
      const { error: err } = await supabase
        .from('api_keys')
        .delete()
        .eq('id', keyId);

      if (err) throw err;
      await loadApiKeys();
    } catch (err) {
      setError('Erreur lors de la suppression');
      console.error(err);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h2 className="text-xl font-bold text-slate-900 mb-2">Clés API</h2>
        <p className="text-sm text-slate-500">
          Gérez vos clés API pour l'intégration chatbot WhatsApp et autres services externes.
        </p>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {generatedKey && (
        <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
          <div className="flex items-start gap-3">
            <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-green-900 mb-2">Clé API créée</h3>
              <p className="text-xs text-green-700 mb-3">
                Copiez votre clé maintenant. Vous ne pourrez pas la voir à nouveau.
              </p>
              <div className="flex items-center gap-2 bg-white p-3 rounded border border-green-200 mb-3">
                <code className="flex-1 text-xs font-mono text-slate-600 break-all">
                  {showKey ? generatedKey : '•'.repeat(generatedKey.length)}
                </code>
                <button
                  onClick={() => setShowKey(!showKey)}
                  className="p-1.5 hover:bg-gray-100 rounded transition-colors"
                >
                  {showKey ? (
                    <EyeOff className="w-4 h-4 text-slate-500" />
                  ) : (
                    <Eye className="w-4 h-4 text-slate-500" />
                  )}
                </button>
                <button
                  onClick={() => copyToClipboard(generatedKey)}
                  className="p-1.5 hover:bg-gray-100 rounded transition-colors"
                >
                  <Copy className="w-4 h-4 text-slate-500" />
                </button>
              </div>
              <button
                onClick={() => setGeneratedKey(null)}
                className="text-sm font-semibold text-green-700 hover:text-green-900"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-lg p-4">
        <h3 className="font-semibold text-slate-900 mb-4">Créer une nouvelle clé</h3>
        <div className="space-y-3">
          <input
            type="text"
            placeholder="Nom de la clé (ex: Chatbot WhatsApp)"
            value={newKeyName}
            onChange={(e) => setNewKeyName(e.target.value)}
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-400/30"
          />
          <button
            onClick={generateNewKey}
            disabled={generatingKey || !newKeyName.trim()}
            className="w-full py-2.5 bg-green-600 text-white rounded-lg font-semibold text-sm hover:bg-green-700 active:scale-95 transition-all disabled:opacity-50"
          >
            {generatingKey ? 'Création...' : 'Générer une clé'}
          </button>
        </div>
      </div>

      <div className="space-y-2">
        <h3 className="font-semibold text-slate-900">Mes clés API</h3>
        {loading ? (
          <p className="text-sm text-slate-500">Chargement...</p>
        ) : apiKeys.length === 0 ? (
          <p className="text-sm text-slate-500">Aucune clé API créée</p>
        ) : (
          <div className="space-y-2">
            {apiKeys.map((key) => (
              <div
                key={key.id}
                className="bg-white border border-slate-200 rounded-lg p-4 flex items-start justify-between"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="font-semibold text-slate-900">{key.name}</p>
                    <span
                      className={`text-xs font-bold px-2 py-1 rounded ${
                        key.active
                          ? 'bg-green-100 text-green-700'
                          : 'bg-gray-100 text-slate-600'
                      }`}
                    >
                      {key.active ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                  <code className="text-xs text-slate-500 font-mono">{key.key_prefix}...</code>
                  <p className="text-xs text-slate-500 mt-2">
                    Créée : {formatDate(key.created_at)}
                    {key.last_used_at && (
                      <>
                        <br />
                        Dernière utilisation : {formatDate(key.last_used_at)}
                      </>
                    )}
                  </p>
                </div>
                <div className="flex gap-1 ml-4">
                  <button
                    onClick={() => toggleKeyStatus(key.id, key.active)}
                    className="p-2 hover:bg-slate-100 rounded transition-colors text-sm font-semibold text-slate-600"
                  >
                    {key.active ? 'Désactiver' : 'Activer'}
                  </button>
                  <button
                    onClick={() => deleteKey(key.id)}
                    className="p-2 hover:bg-red-100 rounded transition-colors"
                  >
                    <Trash2 className="w-4 h-4 text-red-600" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <h4 className="font-semibold text-blue-900 mb-2">Documentation API</h4>
        <p className="text-xs text-blue-700 mb-3">
          Consultez la documentation complète pour intégrer l'API dans votre chatbot.
        </p>
        <a
          href="/WHATSAPP_API_DOCS.md"
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs font-semibold text-blue-600 hover:text-blue-900"
        >
          Lire la documentation →
        </a>
      </div>
    </div>
  );
}

function generateRandomString(length: number): string {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

async function hashKey(key: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(key);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}
