// Example: How to use in your components

import React from 'react';
import {
  useGetEquipmentQuery,
  useCreateEquipmentMutation,
  useUpdateEquipmentMutation,
  useDeleteEquipmentMutation,
} from '../store/apiSlice';

// EXAMPLE 1: Equipment List Component
export const EquipmentList = () => {
  // Automatically fetches, caches, and manages loading/error states
  const { data: equipment, isLoading, error, refetch } = useGetEquipmentQuery();
  
  const [deleteEquipment] = useDeleteEquipmentMutation();

  const handleDelete = async (id) => {
    try {
      await deleteEquipment(id).unwrap();
      // No need to manually update state - RTK Query handles it!
      alert('Equipment deleted successfully');
    } catch (err) {
      alert(err?.data?.message || 'Failed to delete');
    }
  };

  if (isLoading) return <div>Loading...</div>;
  if (error) return <div>Error: {error?.data?.message}</div>;

  return (
    <div>
      <button onClick={refetch}>Refresh</button>
      {equipment?.map((item) => (
        <div key={item._id}>
          <h3>{item.name}</h3>
          <p>{item.serialNumber}</p>
          <button onClick={() => handleDelete(item._id)}>Delete</button>
        </div>
      ))}
    </div>
  );
};

// EXAMPLE 2: Create Equipment Form
export const CreateEquipmentForm = () => {
  const [createEquipment, { isLoading }] = useCreateEquipmentMutation();

  const handleSubmit = async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    
    try {
      const result = await createEquipment({
        name: formData.get('name'),
        serialNumber: formData.get('serialNumber'),
        location: formData.get('location'),
        assignedTeam: formData.get('teamId') || null,
      }).unwrap();
      
      alert('Equipment created successfully!');
      e.target.reset();
    } catch (err) {
      alert(err?.data?.message || 'Failed to create equipment');
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <input name="name" placeholder="Name" required />
      <input name="serialNumber" placeholder="Serial Number" required />
      <input name="location" placeholder="Location" required />
      <button type="submit" disabled={isLoading}>
        {isLoading ? 'Creating...' : 'Create Equipment'}
      </button>
    </form>
  );
};

// EXAMPLE 3: Edit Equipment
export const EditEquipmentForm = ({ equipmentId }) => {
  // Fetch single equipment item
  const { data: equipment, isLoading } = useGetEquipmentByIdQuery(equipmentId);
  const [updateEquipment, { isLoading: isUpdating }] = useUpdateEquipmentMutation();

  if (isLoading) return <div>Loading...</div>;

  const handleSubmit = async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    
    try {
      await updateEquipment({
        id: equipmentId,
        name: formData.get('name'),
        serialNumber: formData.get('serialNumber'),
        location: formData.get('location'),
      }).unwrap();
      
      alert('Updated successfully!');
    } catch (err) {
      alert(err?.data?.message || 'Failed to update');
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <input name="name" defaultValue={equipment?.name} required />
      <input name="serialNumber" defaultValue={equipment?.serialNumber} required />
      <input name="location" defaultValue={equipment?.location} required />
      <button type="submit" disabled={isUpdating}>
        {isUpdating ? 'Updating...' : 'Update'}
      </button>
    </form>
  );
};

// EXAMPLE 4: Kanban Board
export const RequestKanban = () => {
  const { data: kanbanData, isLoading } = useGetKanbanRequestsQuery();
  const [updateStatus] = useUpdateRequestStatusMutation();

  const handleStatusChange = async (requestId, newStatus) => {
    try {
      await updateStatus({
        id: requestId,
        status: newStatus,
      }).unwrap();
    } catch (err) {
      alert(err?.data?.message || 'Failed to update status');
    }
  };

  if (isLoading) return <div>Loading kanban...</div>;

  return (
    <div className="kanban-board">
      {Object.entries(kanbanData || {}).map(([status, requests]) => (
        <div key={status} className="kanban-column">
          <h3>{status}</h3>
          {requests.map((request) => (
            <div key={request._id} className="kanban-card">
              <h4>{request.title}</h4>
              <p>{request.description}</p>
              <button onClick={() => handleStatusChange(request._id, 'IN_PROGRESS')}>
                Move to In Progress
              </button>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
};