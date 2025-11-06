import React, { useState } from 'react';
import Dialog from './Dialog';
import Button from './Button';
import Switch from './Switch';
import { Schedule } from '../types';
import { PlusIcon, Trash2Icon } from './icons';
import { PRESETS } from '../constants';

const WEEK_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const initialScheduleState = {
  id: '',
  enabled: true,
  startTime: '08:00',
  endTime: '18:00',
  days: [true, true, true, true, true, false, false],
  action: { type: 'preset' as 'preset' | 'color' | 'power_off', value: 'clear', name: 'Preset: Clear White' }
};

interface ScheduleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  schedules: Schedule[];
  onSchedulesChange: (schedules: Schedule[]) => void;
  onSync: () => void;
  disabled: boolean;
}

const ScheduleDialog: React.FC<ScheduleDialogProps> = ({ open, onOpenChange, schedules, onSchedulesChange, onSync, disabled }) => {
  const [isFormVisible, setIsFormVisible] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<Schedule | null>(null);

  const handleAddNew = () => {
    setEditingSchedule({ ...initialScheduleState, id: Date.now().toString() });
    setIsFormVisible(true);
  };

  const handleEdit = (schedule: Schedule) => {
    setEditingSchedule(schedule);
    setIsFormVisible(true);
  };

  const handleDelete = (id: string) => {
    onSchedulesChange(schedules.filter(s => s.id !== id));
  };
  
  const handleToggle = (id: string) => {
    onSchedulesChange(schedules.map(s => s.id === id ? { ...s, enabled: !s.enabled } : s));
  };
  
  const handleSave = (schedule: Schedule) => {
    const exists = schedules.some(s => s.id === schedule.id);
    if (exists) {
      onSchedulesChange(schedules.map(s => s.id === schedule.id ? schedule : s));
    } else {
      onSchedulesChange([...schedules, schedule]);
    }
    setIsFormVisible(false);
    setEditingSchedule(null);
  };

  const handleCancel = () => {
    setIsFormVisible(false);
    setEditingSchedule(null);
  };

  const getDayString = (days: boolean[]) => {
    const activeDays = WEEK_DAYS.filter((_, i) => days[i]);
    if (activeDays.length === 7) return 'Every day';
    if (activeDays.length === 0) return 'Never';
    return activeDays.join(', ');
  };
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Lighting Schedules">
      <div className="mt-4 max-h-[60vh] overflow-y-auto space-y-4 pr-2">
        {!isFormVisible && (
          <>
            {schedules.length > 0 ? (
              schedules.map(schedule => (
                <div key={schedule.id} className="p-4 rounded-lg bg-white/5 flex items-center justify-between gap-2">
                  <div className="flex-grow">
                    <div className="flex items-center gap-2">
                       <Switch checked={schedule.enabled} onCheckedChange={() => handleToggle(schedule.id)} />
                       <div>
                         <p className="font-semibold text-white">{schedule.startTime} - {schedule.endTime}</p>
                         <p className="text-sm text-gray-400">{schedule.action.name}</p>
                       </div>
                    </div>
                    <p className="text-xs text-gray-500 mt-2">{getDayString(schedule.days)}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Button variant="ghost" size="sm" onClick={() => handleEdit(schedule)}>Edit</Button>
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(schedule.id)} className="text-red-400 hover:bg-red-500/10">
                      <Trash2Icon className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-8 text-gray-500">
                <p>No schedules created yet.</p>
                <p>Click "Add New Schedule" to begin.</p>
              </div>
            )}
          </>
        )}

        {isFormVisible && editingSchedule && (
          <ScheduleForm schedule={editingSchedule} onSave={handleSave} onCancel={handleCancel} />
        )}
      </div>

      <div className="mt-6 pt-4 border-t border-white/10 flex flex-col sm:flex-row gap-3">
        {!isFormVisible ? (
          <>
            <Button onClick={handleAddNew} variant="outline" className="w-full">
              <PlusIcon className="w-4 h-4 mr-2"/>
              Add New Schedule
            </Button>
            <Button onClick={onSync} disabled={disabled || schedules.length === 0} className="w-full">
              Sync with Device
            </Button>
          </>
        ) : null}
      </div>
    </Dialog>
  );
};

const ScheduleForm: React.FC<{ schedule: Schedule; onSave: (schedule: Schedule) => void; onCancel: () => void; }> = ({ schedule, onSave, onCancel }) => {
  const [formState, setFormState] = useState(schedule);

  const handleDayToggle = (index: number) => {
    const newDays = [...formState.days];
    newDays[index] = !newDays[index];
    setFormState({ ...formState, days: newDays });
  };
  
  const handleActionChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const type = e.target.value as Schedule['action']['type'];
    let value = '';
    let name = '';
    if (type === 'preset') {
      value = PRESETS[0].id;
      name = `Preset: ${PRESETS[0].name}`;
    } else if (type === 'color') {
      value = '#ffffff';
      name = `Color: #ffffff`;
    } else if (type === 'power_off') {
      value = 'off';
      name = 'Power Off';
    }
    setFormState({ ...formState, action: { type, value, name } });
  };

  const handleActionValueChange = (e: React.ChangeEvent<HTMLSelectElement | HTMLInputElement>) => {
    const { value } = e.target;
    let name = '';
     if (formState.action.type === 'preset') {
      const preset = PRESETS.find(p => p.id === value);
      name = `Preset: ${preset?.name || ''}`;
    } else if (formState.action.type === 'color') {
      name = `Color: ${value}`;
    } else {
      name = 'Power Off';
    }
    setFormState({ ...formState, action: { ...formState.action, value, name } });
  };

  return (
    <div className="p-4 rounded-lg bg-white/5 space-y-6">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-sm font-medium text-gray-300 mb-1 block">Start Time</label>
          <input type="time" value={formState.startTime} onChange={e => setFormState({...formState, startTime: e.target.value})} className="w-full px-3 py-2 bg-[#0D1117] border border-[#30363D] rounded-md"/>
        </div>
        <div>
          <label className="text-sm font-medium text-gray-300 mb-1 block">End Time</label>
          <input type="time" value={formState.endTime} onChange={e => setFormState({...formState, endTime: e.target.value})} className="w-full px-3 py-2 bg-[#0D1117] border border-[#30363D] rounded-md"/>
        </div>
      </div>
      <div>
        <label className="text-sm font-medium text-gray-300 mb-2 block">Repeat on</label>
        <div className="flex items-center justify-between gap-1">
          {WEEK_DAYS.map((day, i) => (
            <button key={day} onClick={() => handleDayToggle(i)} className={`w-9 h-9 text-xs rounded-full transition-colors ${formState.days[i] ? 'bg-purple-500 text-white' : 'bg-white/10 hover:bg-white/20'}`}>
              {day[0]}
            </button>
          ))}
        </div>
      </div>
      <div>
        <label className="text-sm font-medium text-gray-300 mb-1 block">Action</label>
        <div className="flex gap-2">
            <select value={formState.action.type} onChange={handleActionChange} className="w-full px-3 py-2 bg-[#0D1117] border border-[#30363D] rounded-md">
              <option value="preset">Preset</option>
              <option value="color">Custom Color</option>
              <option value="power_off">Power Off</option>
            </select>
            {formState.action.type === 'preset' && (
              <select value={formState.action.value} onChange={handleActionValueChange} className="w-full px-3 py-2 bg-[#0D1117] border border-[#30363D] rounded-md">
                {PRESETS.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            )}
            {formState.action.type === 'color' && (
               <input type="color" value={formState.action.value} onChange={handleActionValueChange} className="p-1 h-10 w-full bg-[#0D1117] border border-[#30363D] rounded-md cursor-pointer"/>
            )}
        </div>
      </div>
      <div className="flex justify-end gap-3 pt-4">
        <Button variant="outline" onClick={onCancel}>Cancel</Button>
        <Button onClick={() => onSave(formState)}>Save Schedule</Button>
      </div>
    </div>
  );
};

export default ScheduleDialog;
