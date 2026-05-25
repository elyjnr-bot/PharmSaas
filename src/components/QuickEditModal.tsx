import { useState, useEffect } from 'react';
import { X, Save, Plus, Trash2, Package, Printer, Box } from 'lucide-react';
import { Medication, supabase } from '../lib/supabase';
import { insertWithUserId, updateWithUserId } from '../lib/supabaseHelpers';
import { offlineSafeUpdateMedication, offlineSafeInsertInventoryUnits, type OfflineInventoryUnit } from '../lib/writeService';
import { useWorkflow, generateUnitCodes } from '../lib/workflowContext';
import PrintUnitsModal from './PrintUnitsModal';

interface QuickEditModalProps {
  medication: Medication;
  onClose: () => void;
  onSave: () => void;
}

interface Batch {
  id?: string;
  batch_number: string;
  quantity: number;
  expiry_date: string;
  received_date: string;
}

interface InventoryUnit {
  id: string;
  unit_code: string;
  batch_number: string;
  expiry_date: string | null;
  status: string;
  imported_code: string | null;
  created_at: string;
}

export default function QuickEditModal({ medication, onClose, onSave }: QuickEditModalProps) {
  const { isUnitMode } = useWorkflow();
  const [formData, setFormData] = useState({
    price: medication.price || 0,
    min_stock: medication.min_stock || 100,
    category: medication.category || '',
    location: medication.location || '',
    code_interne: medication.code_interne || '',
  });
  const [batches, setBatches] = useState<Batch[]>([]);
  const [units, setUnits] = useState<InventoryUnit[]>([]);
  const [newBatch, setNewBatch] = useState<Batch>({
    batch_number: '',
    quantity: 0,
    expiry_date: '',
    received_date: new Date().toISOString().split('T')[0],
  });
  const [isLoading, setIsLoading] = useState(false);
  const [showAddBatch, setShowAddBatch] = useState(false);
  const [generatedUnits, setGeneratedUnits] = useState<Array<{ unit_code: string; medication_name: string; batch_number: string; expiry_date: string }> | null>(null);

  useEffect(() => {
    if (isUnitMode) {
      loadUnits();
    } else {
      loadBatches();
    }
  }, [medication.id, isUnitMode]);

  const loadUnits = async () => {
    try {
      const { data, error } = await supabase
        .from('inventory_units')
        .select('*')
        .eq('medication_id', medication.id)
        .eq('status', 'available')
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) throw error;
      setUnits(data || []);
    } catch (error) {
      console.error('Error loading units:', error);
    }
  };

  const loadBatches = async () => {
    try {
      const { data, error } = await supabase
        .from('medication_batches')
        .select('*')
        .eq('medication_id', medication.id)
        .order('expiry_date', { ascending: true });

      if (error) throw error;
      setBatches(data || []);
    } catch (error) {
      console.error('Error loading batches:', error);
    }
  };

  const handleSave = async () => {
    setIsLoading(true);
    try {
      await offlineSafeUpdateMedication(medication.id, {
        price: formData.price,
        min_stock: formData.min_stock,
        category: formData.category || null,
        location: formData.location || null,
        code_interne: formData.code_interne || null,
      });
      onSave();
      onClose();
    } catch (error) {
      console.error('Error updating medication:', error);
      alert('Erreur lors de la mise a jour');
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddBatch = async () => {
    if (!newBatch.batch_number || !newBatch.expiry_date || newBatch.quantity <= 0) {
      alert('Veuillez remplir tous les champs du lot');
      return;
    }

    setIsLoading(true);
    try {
      if (!isUnitMode) {
        const { error } = await insertWithUserId(
          'medication_batches',
          [{
            medication_id: medication.id,
            batch_number: newBatch.batch_number,
            quantity: newBatch.quantity,
            expiry_date: newBatch.expiry_date,
            received_date: newBatch.received_date,
          }]
        );

        if (error) throw error;
      }

      if (isUnitMode) {
        const receptionBatch = `REC-${Date.now()}`;
        const generatedCodes = generateUnitCodes(
          medication.id,
          newBatch.quantity,
          receptionBatch,
          newBatch.batch_number,
          newBatch.expiry_date
        );

        const toInsert: OfflineInventoryUnit[] = generatedCodes.map(u => ({
          ...u,
          medication_id: medication.id,
          status: 'available',
        }));

        const CHUNK = 200;
        for (let i = 0; i < toInsert.length; i += CHUNK) {
          await offlineSafeInsertInventoryUnits(toInsert.slice(i, i + CHUNK));
        }

        const newQty = (medication.quantity || 0) + newBatch.quantity;
        await offlineSafeUpdateMedication(medication.id, { quantity: newQty });

        setGeneratedUnits(generatedCodes.map(u => ({
          unit_code: u.unit_code,
          medication_name: medication.name,
          batch_number: u.batch_number,
          expiry_date: u.expiry_date,
        })));

        await loadUnits();
      } else {
        await loadBatches();
      }

      setNewBatch({
        batch_number: '',
        quantity: 0,
        expiry_date: '',
        received_date: new Date().toISOString().split('T')[0],
      });
      setShowAddBatch(false);
    } catch (error) {
      console.error('Error adding batch:', error);
      alert('Erreur lors de l\'ajout du lot');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteBatch = async (batchId: string) => {
    if (!confirm('Supprimer ce lot ?')) return;

    setIsLoading(true);
    try {
      const { error } = await supabase
        .from('medication_batches')
        .delete()
        .eq('id', batchId);

      if (error) throw error;

      await loadBatches();
      alert('Lot supprime');
    } catch (error) {
      console.error('Error deleting batch:', error);
      alert('Erreur lors de la suppression');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteUnit = async (unitId: string) => {
    if (!confirm('Supprimer cette unite ?')) return;

    setIsLoading(true);
    try {
      const { error } = await supabase
        .from('inventory_units')
        .delete()
        .eq('id', unitId);

      if (error) throw error;

      const newQty = Math.max(0, (medication.quantity || 0) - 1);
      await updateWithUserId(
        'medications',
        { quantity: newQty },
        { id: medication.id }
      );

      await loadUnits();
    } catch (error) {
      console.error('Error deleting unit:', error);
      alert('Erreur lors de la suppression');
    } finally {
      setIsLoading(false);
    }
  };

  const totalBatchQuantity = batches.reduce((sum, b) => sum + b.quantity, 0);
  const totalUnitsCount = units.length;

  return (
    <>
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[999] p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-200 p-6 z-10">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">{medication.name}</h2>
              <p className="text-sm text-gray-500">{medication.dosage}</p>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg">
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>
        </div>

        <div className="p-6 space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Prix de vente (FCFA)
              </label>
              <input
                type="number"
                value={formData.price}
                onChange={(e) => setFormData({ ...formData, price: parseFloat(e.target.value) || 0 })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Stock minimum
              </label>
              <input
                type="number"
                value={formData.min_stock}
                onChange={(e) => setFormData({ ...formData, min_stock: parseInt(e.target.value) || 0 })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Catégorie
              </label>
              <input
                type="text"
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                placeholder="Ex: Antibiotique"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Emplacement
              </label>
              <input
                type="text"
                value={formData.location}
                onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                placeholder="Ex: Étagère A3"
              />
            </div>

            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Code interne
              </label>
              <input
                type="text"
                value={formData.code_interne}
                onChange={(e) => setFormData({ ...formData, code_interne: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                placeholder="Ex: MED-001"
              />
            </div>
          </div>

          <div className="border-t border-gray-200 pt-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">
                  {isUnitMode ? 'Unites en stock' : 'Lots en stock'}
                </h3>
                <p className="text-sm text-gray-500">
                  Total: {isUnitMode ? totalUnitsCount : totalBatchQuantity} unites
                </p>
              </div>
              <button
                onClick={() => setShowAddBatch(!showAddBatch)}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700"
              >
                <Plus className="w-4 h-4" />
                {isUnitMode ? 'Ajouter des unites' : 'Ajouter un lot'}
              </button>
            </div>

            {showAddBatch && (
              <div className="mb-4 p-4 bg-green-50 rounded-lg border border-green-100 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Numero de lot
                    </label>
                    <input
                      type="text"
                      value={newBatch.batch_number}
                      onChange={(e) => setNewBatch({ ...newBatch, batch_number: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                      placeholder="Ex: LOT2024-001"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Quantite
                    </label>
                    <input
                      type="number"
                      value={newBatch.quantity}
                      onChange={(e) => setNewBatch({ ...newBatch, quantity: parseInt(e.target.value) || 0 })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Date d'expiration
                    </label>
                    <input
                      type="date"
                      value={newBatch.expiry_date}
                      onChange={(e) => setNewBatch({ ...newBatch, expiry_date: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Date de reception
                    </label>
                    <input
                      type="date"
                      value={newBatch.received_date}
                      onChange={(e) => setNewBatch({ ...newBatch, received_date: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    />
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleAddBatch}
                    disabled={isLoading}
                    className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700 disabled:bg-gray-300"
                  >
                    Valider
                  </button>
                  <button
                    onClick={() => setShowAddBatch(false)}
                    className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg font-semibold hover:bg-gray-50"
                  >
                    Annuler
                  </button>
                </div>
              </div>
            )}

            {isUnitMode ? (
              units.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <Box className="w-12 h-12 text-gray-300 mx-auto mb-2" />
                  <p>Aucune unite en stock</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {units.map((unit) => (
                    <div key={unit.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200">
                      <div className="flex-1">
                        <p className="font-mono text-sm font-semibold text-gray-900">{unit.imported_code || unit.unit_code}</p>
                        <div className="flex items-center gap-4 text-xs text-gray-500 mt-1">
                          <span>Lot: {unit.batch_number}</span>
                          {unit.expiry_date && (
                            <span>Exp: {new Date(unit.expiry_date).toLocaleDateString('fr-FR')}</span>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={() => handleDeleteUnit(unit.id)}
                        className="p-2 text-red-600 hover:bg-red-50 rounded-lg"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                  {units.length >= 100 && (
                    <p className="text-center text-xs text-gray-400 py-2">
                      Affichage limite aux 100 premieres unites
                    </p>
                  )}
                </div>
              )
            ) : (
              batches.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <Package className="w-12 h-12 text-gray-300 mx-auto mb-2" />
                  <p>Aucun lot enregistre</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {batches.map((batch) => (
                    <div key={batch.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200">
                      <div className="flex-1">
                        <p className="font-semibold text-gray-900">{batch.batch_number}</p>
                        <div className="flex items-center gap-4 text-sm text-gray-600 mt-1">
                          <span>Qte: {batch.quantity}</span>
                          <span>Exp: {new Date(batch.expiry_date).toLocaleDateString('fr-FR')}</span>
                        </div>
                      </div>
                      <button
                        onClick={() => handleDeleteBatch(batch.id!)}
                        className="p-2 text-red-600 hover:bg-red-50 rounded-lg"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )
            )}
          </div>
        </div>

        {isUnitMode && generatedUnits && generatedUnits.length > 0 && (
          <div className="mx-6 mb-4 bg-green-50 border border-green-200 rounded-xl p-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-bold text-green-800">{generatedUnits.length} codes unitaires générés</p>
              <p className="text-xs text-green-600 mt-0.5">Lot {generatedUnits[0].batch_number}</p>
            </div>
            <button
              onClick={() => setGeneratedUnits(generatedUnits)}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-semibold hover:bg-green-700"
            >
              <Printer className="w-4 h-4" />
              Imprimer
            </button>
          </div>
        )}

        <div className="sticky bottom-0 bg-white border-t border-gray-200 p-6 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-6 py-3 border border-gray-300 text-gray-700 rounded-xl font-semibold hover:bg-gray-50"
          >
            Annuler
          </button>
          <button
            onClick={handleSave}
            disabled={isLoading}
            className="flex-1 px-6 py-3 bg-green-600 text-white rounded-xl font-semibold hover:bg-green-700 disabled:bg-gray-300 flex items-center justify-center gap-2"
          >
            <Save className="w-4 h-4" />
            Enregistrer
          </button>
        </div>
      </div>
    </div>

    {generatedUnits && (
      <PrintUnitsModal
        units={generatedUnits}
        medicationName={medication.name}
        onClose={() => setGeneratedUnits(null)}
      />
    )}
    </>
  );
}
