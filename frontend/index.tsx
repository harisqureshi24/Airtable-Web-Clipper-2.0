import {
    initializeBlock,
    useBase,
    useRecords,
    useGlobalConfig,
    Box,
    Button,
    FormField,
    Input,
    Select,
    Text,
    Heading,
    TablePickerSynced,
    Icon,
    Loader,
    colors,
} from '@airtable/blocks/ui';
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { FieldType, Table, Field } from '@airtable/blocks/models';

// Toast notification component
interface ToastProps {
    message: string;
    type: 'success' | 'error' | 'info';
    onClose: () => void;
}

function Toast({ message, type, onClose }: ToastProps) {
    useEffect(() => {
        const timer = setTimeout(onClose, 4000);
        return () => clearTimeout(timer);
    }, [onClose]);

    const bgColor = type === 'success' ? '#10B981' : type === 'error' ? '#EF4444' : '#3B82F6';

    return (
        <Box
            position="fixed"
            bottom="20px"
            right="20px"
            backgroundColor={bgColor}
            padding={3}
            borderRadius="default"
            display="flex"
            alignItems="center"
            style={{
                color: 'white',
                boxShadow: '0 10px 40px rgba(0,0,0,0.2)',
                zIndex: 1000,
                animation: 'slideIn 0.3s ease-out'
            }}
        >
            <Icon
                name={type === 'success' ? 'check' : type === 'error' ? 'x' : 'info'}
                size={16}
                marginRight={2}
            />
            <Text textColor="white">{message}</Text>
            <Button
                onClick={onClose}
                icon="x"
                variant="secondary"
                size="small"
                marginLeft={2}
                style={{ background: 'rgba(255,255,255,0.2)', border: 'none' }}
            />
        </Box>
    );
}

// Linked Records Field Component - handles useRecords hook properly
interface LinkedRecordsFieldProps {
    field: Field;
    value: Array<{ id: string }>;
    onChange: (value: Array<{ id: string }>) => void;
    onCreateNew: (fieldId: string, linkedTableId: string) => void;
    base: ReturnType<typeof useBase>;
}

function LinkedRecordsField({ field, value, onChange, onCreateNew, base }: LinkedRecordsFieldProps) {
    const linkedTableId = field.options?.linkedTableId as string | undefined;
    const linkedTable = linkedTableId ? base.getTableByIdIfExists(linkedTableId) : null;

    // useRecords is now called unconditionally at the top level of this component
    const linkedRecords = useRecords(linkedTable);

    if (!linkedTable) {
        return <Text textColor="light">Linked table not found</Text>;
    }

    const currentValue = value || [];

    return (
        <Box display="flex" flexDirection="column" gap={2}>
            <Select
                value=""
                onChange={(selectedValue) => {
                    if (selectedValue) {
                        // Check if already selected
                        if (!currentValue.find(v => v.id === selectedValue)) {
                            onChange([...currentValue, { id: selectedValue as string }]);
                        }
                    }
                }}
                options={[
                    { value: '', label: 'Select existing record...' },
                    ...linkedRecords
                        .filter(record => !currentValue.find(v => v.id === record.id))
                        .map((record) => ({
                            value: record.id,
                            label: record.name || record.id
                        }))
                ]}
            />

            <Button
                onClick={() => linkedTableId && onCreateNew(field.id, linkedTableId)}
                icon="plus"
                variant="secondary"
                size="small"
            >
                Create new in {linkedTable.name}
            </Button>

            {currentValue.length > 0 && (
                <Box
                    backgroundColor="lightGray1"
                    padding={2}
                    borderRadius="default"
                >
                    <Text size="small" fontWeight="strong" marginBottom={1}>
                        Selected ({currentValue.length}):
                    </Text>
                    {currentValue.map((item, idx) => {
                        const record = linkedRecords.find(r => r.id === item.id);
                        return (
                            <Box
                                key={idx}
                                display="flex"
                                alignItems="center"
                                justifyContent="space-between"
                                padding={1}
                                marginTop={1}
                                backgroundColor="white"
                                borderRadius="default"
                            >
                                <Text size="small">{record?.name || item.id}</Text>
                                <Button
                                    size="small"
                                    variant="danger"
                                    icon="x"
                                    aria-label="Remove"
                                    onClick={() => {
                                        onChange(currentValue.filter((_, i) => i !== idx));
                                    }}
                                />
                            </Box>
                        );
                    })}
                </Box>
            )}
        </Box>
    );
}

// Attachment Field Component
interface AttachmentFieldProps {
    field: Field;
    value: Array<{ url: string; filename?: string }>;
    onChange: (value: Array<{ url: string; filename?: string }>) => void;
}

function AttachmentField({ field, value, onChange }: AttachmentFieldProps) {
    const [urlInput, setUrlInput] = useState('');
    const currentValue = value || [];

    const addAttachment = () => {
        if (urlInput.trim()) {
            const filename = urlInput.split('/').pop() || 'attachment';
            onChange([...currentValue, { url: urlInput.trim(), filename }]);
            setUrlInput('');
        }
    };

    return (
        <Box display="flex" flexDirection="column" gap={2}>
            <Box display="flex" gap={2}>
                <Input
                    value={urlInput}
                    onChange={(e) => setUrlInput(e.target.value)}
                    placeholder="Enter attachment URL..."
                    flex="1"
                />
                <Button
                    onClick={addAttachment}
                    icon="plus"
                    variant="secondary"
                    disabled={!urlInput.trim()}
                >
                    Add
                </Button>
            </Box>

            {currentValue.length > 0 && (
                <Box
                    backgroundColor="lightGray1"
                    padding={2}
                    borderRadius="default"
                >
                    <Text size="small" fontWeight="strong" marginBottom={1}>
                        Attachments ({currentValue.length}):
                    </Text>
                    {currentValue.map((attachment, idx) => (
                        <Box
                            key={idx}
                            display="flex"
                            alignItems="center"
                            justifyContent="space-between"
                            padding={1}
                            marginTop={1}
                            backgroundColor="white"
                            borderRadius="default"
                        >
                            <Text size="small" style={{ wordBreak: 'break-all' }}>
                                {attachment.filename || attachment.url}
                            </Text>
                            <Button
                                size="small"
                                variant="danger"
                                icon="x"
                                aria-label="Remove"
                                onClick={() => {
                                    onChange(currentValue.filter((_, i) => i !== idx));
                                }}
                            />
                        </Box>
                    ))}
                </Box>
            )}

            <Text size="small" textColor="light">
                Tip: Paste image URLs from the web. For local files, upload to a file hosting service first.
            </Text>
        </Box>
    );
}

// Rating Field Component
interface RatingFieldProps {
    value: number;
    max: number;
    onChange: (value: number) => void;
}

function RatingField({ value, max, onChange }: RatingFieldProps) {
    return (
        <Box display="flex" gap={1}>
            {Array.from({ length: max }, (_, i) => (
                <Box
                    key={i}
                    as="button"
                    onClick={() => onChange(i + 1)}
                    style={{
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        padding: '4px',
                        fontSize: '20px',
                        color: i < (value || 0) ? '#FCB400' : '#D1D5DB',
                        transition: 'transform 0.1s ease'
                    }}
                    onMouseEnter={(e: any) => e.target.style.transform = 'scale(1.2)'}
                    onMouseLeave={(e: any) => e.target.style.transform = 'scale(1)'}
                >
                    ★
                </Box>
            ))}
            {value > 0 && (
                <Button
                    size="small"
                    variant="secondary"
                    icon="x"
                    aria-label="Clear rating"
                    onClick={() => onChange(0)}
                    marginLeft={1}
                />
            )}
        </Box>
    );
}

// Main Extension Component
function EnhancedWebClipperExtension() {
    const base = useBase();
    const globalConfig = useGlobalConfig();

    const tableId = globalConfig.get('selectedTableId') as string | undefined;
    const table = tableId ? base.getTableByIdIfExists(tableId) : null;

    const [fieldValues, setFieldValues] = useState<Record<string, any>>({});
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [showNewRecordModal, setShowNewRecordModal] = useState<{
        fieldId: string;
        linkedTableId: string;
    } | null>(null);
    const [newRecordData, setNewRecordData] = useState<Record<string, any>>({});
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

    // Reset field values when table changes
    useEffect(() => {
        setFieldValues({});
    }, [tableId]);

    const showToast = useCallback((message: string, type: 'success' | 'error' | 'info') => {
        setToast({ message, type });
    }, []);

    const handleFieldChange = useCallback((fieldId: string, value: any) => {
        setFieldValues(prev => ({
            ...prev,
            [fieldId]: value
        }));
    }, []);

    const handleCreateLinkedRecord = useCallback((fieldId: string, linkedTableId: string) => {
        setShowNewRecordModal({ fieldId, linkedTableId });
        setNewRecordData({});
    }, []);

    const submitNewLinkedRecord = useCallback(async () => {
        if (!showNewRecordModal) return;

        const linkedTable = base.getTableByIdIfExists(showNewRecordModal.linkedTableId);
        if (!linkedTable) {
            showToast('Linked table not found', 'error');
            return;
        }

        try {
            // Create the new record in the linked table
            const recordId = await linkedTable.createRecordAsync(newRecordData);

            // Add the new record to the field values
            const currentValue = fieldValues[showNewRecordModal.fieldId] || [];
            handleFieldChange(showNewRecordModal.fieldId, [...currentValue, { id: recordId }]);

            // Close modal
            setShowNewRecordModal(null);
            setNewRecordData({});

            showToast(`Record created in ${linkedTable.name}`, 'success');
        } catch (error) {
            console.error('Error creating linked record:', error);
            showToast('Failed to create linked record', 'error');
        }
    }, [showNewRecordModal, base, newRecordData, fieldValues, handleFieldChange, showToast]);

    const handleSubmit = useCallback(async () => {
        if (!table) {
            showToast('Please select a table first', 'error');
            return;
        }

        // Check if at least one field has a value
        const hasValues = Object.values(fieldValues).some(v =>
            v !== undefined && v !== '' && v !== null &&
            !(Array.isArray(v) && v.length === 0)
        );

        if (!hasValues) {
            showToast('Please fill in at least one field', 'error');
            return;
        }

        setIsSubmitting(true);

        try {
            const fields: Record<string, any> = {};

            // Process field values and map to field names
            for (const [fieldId, value] of Object.entries(fieldValues)) {
                if (value !== undefined && value !== '' && value !== null) {
                    const field = table.getFieldByIdIfExists(fieldId);
                    if (field) {
                        fields[field.name] = value;
                    }
                }
            }

            await table.createRecordAsync(fields);

            // Reset form
            setFieldValues({});
            showToast('Record created successfully!', 'success');
        } catch (error: any) {
            console.error('Error creating record:', error);
            showToast(error.message || 'Failed to create record', 'error');
        } finally {
            setIsSubmitting(false);
        }
    }, [table, fieldValues, showToast]);

    // Get writable fields
    const writableFields = useMemo(() => {
        if (!table) return [];
        return table.fields.filter(field =>
            !field.isComputed &&
            field.type !== FieldType.AUTO_NUMBER &&
            field.type !== FieldType.CREATED_TIME &&
            field.type !== FieldType.LAST_MODIFIED_TIME &&
            field.type !== FieldType.CREATED_BY &&
            field.type !== FieldType.LAST_MODIFIED_BY
        );
    }, [table]);

    const renderFieldInput = (field: Field) => {
        const fieldId = field.id;
        const fieldType = field.type;
        const value = fieldValues[fieldId];

        switch (fieldType) {
            case FieldType.SINGLE_LINE_TEXT:
            case FieldType.EMAIL:
            case FieldType.URL:
            case FieldType.PHONE_NUMBER:
                return (
                    <Input
                        value={value || ''}
                        onChange={(e) => handleFieldChange(fieldId, e.target.value)}
                        placeholder={`Enter ${field.name.toLowerCase()}`}
                        type={fieldType === FieldType.EMAIL ? 'email' : fieldType === FieldType.URL ? 'url' : 'text'}
                    />
                );

            case FieldType.MULTILINE_TEXT:
            case FieldType.RICH_TEXT:
                return (
                    <Input
                        value={value || ''}
                        onChange={(e) => handleFieldChange(fieldId, e.target.value)}
                        placeholder={`Enter ${field.name.toLowerCase()}`}
                        style={{ minHeight: '80px' }}
                    />
                );

            case FieldType.NUMBER:
            case FieldType.CURRENCY:
            case FieldType.PERCENT:
                return (
                    <Input
                        type="number"
                        value={value ?? ''}
                        onChange={(e) => {
                            const numValue = e.target.value ? parseFloat(e.target.value) : undefined;
                            handleFieldChange(fieldId, numValue);
                        }}
                        placeholder={`Enter ${field.name.toLowerCase()}`}
                        step={fieldType === FieldType.PERCENT ? '0.01' : 'any'}
                    />
                );

            case FieldType.DATE:
                return (
                    <Input
                        type="date"
                        value={value || ''}
                        onChange={(e) => handleFieldChange(fieldId, e.target.value || undefined)}
                    />
                );

            case FieldType.DATE_TIME:
                return (
                    <Box display="flex" flexDirection="column" gap={1}>
                        <Input
                            type="datetime-local"
                            value={value ? new Date(value).toISOString().slice(0, 16) : ''}
                            onChange={(e) => {
                                if (e.target.value) {
                                    handleFieldChange(fieldId, new Date(e.target.value).toISOString());
                                } else {
                                    handleFieldChange(fieldId, undefined);
                                }
                            }}
                        />
                        <Text size="xsmall" textColor="light">
                            Select date and time
                        </Text>
                    </Box>
                );

            case FieldType.CHECKBOX:
                return (
                    <Box display="flex" alignItems="center" gap={2}>
                        <input
                            type="checkbox"
                            checked={value || false}
                            onChange={(e) => handleFieldChange(fieldId, e.target.checked)}
                            style={{ width: '20px', height: '20px', cursor: 'pointer' }}
                        />
                        <Text>{value ? 'Yes' : 'No'}</Text>
                    </Box>
                );

            case FieldType.SINGLE_SELECT:
                const singleSelectOptions = (field.options?.choices as Array<{ name: string }>) || [];
                return (
                    <Select
                        value={value?.name || ''}
                        onChange={(selectedValue) => {
                            handleFieldChange(fieldId, selectedValue ? { name: selectedValue } : undefined);
                        }}
                        options={[
                            { value: '', label: 'Select an option...' },
                            ...singleSelectOptions.map((choice) => ({
                                value: choice.name,
                                label: choice.name
                            }))
                        ]}
                    />
                );

            case FieldType.MULTIPLE_SELECTS:
                const multiSelectOptions = (field.options?.choices as Array<{ name: string }>) || [];
                const currentMultiValue = (value as Array<{ name: string }>) || [];
                return (
                    <Box display="flex" flexDirection="column" gap={2}>
                        <Select
                            value=""
                            onChange={(selectedValue) => {
                                if (selectedValue && !currentMultiValue.find(v => v.name === selectedValue)) {
                                    handleFieldChange(fieldId, [...currentMultiValue, { name: selectedValue }]);
                                }
                            }}
                            options={[
                                { value: '', label: 'Add option...' },
                                ...multiSelectOptions
                                    .filter(opt => !currentMultiValue.find(v => v.name === opt.name))
                                    .map((choice) => ({
                                        value: choice.name,
                                        label: choice.name
                                    }))
                            ]}
                        />
                        {currentMultiValue.length > 0 && (
                            <Box display="flex" flexWrap="wrap" gap={1}>
                                {currentMultiValue.map((item, idx) => (
                                    <Box
                                        key={idx}
                                        display="flex"
                                        alignItems="center"
                                        gap={1}
                                        padding={1}
                                        backgroundColor="lightGray1"
                                        borderRadius="default"
                                    >
                                        <Text size="small">{item.name}</Text>
                                        <Button
                                            size="small"
                                            variant="secondary"
                                            icon="x"
                                            aria-label="Remove"
                                            onClick={() => {
                                                handleFieldChange(fieldId, currentMultiValue.filter((_, i) => i !== idx));
                                            }}
                                            style={{ padding: '2px' }}
                                        />
                                    </Box>
                                ))}
                            </Box>
                        )}
                    </Box>
                );

            case FieldType.MULTIPLE_RECORD_LINKS:
                return (
                    <LinkedRecordsField
                        field={field}
                        value={value || []}
                        onChange={(newValue) => handleFieldChange(fieldId, newValue)}
                        onCreateNew={handleCreateLinkedRecord}
                        base={base}
                    />
                );

            case FieldType.RATING:
                const maxRating = (field.options?.max as number) || 5;
                return (
                    <RatingField
                        value={value || 0}
                        max={maxRating}
                        onChange={(newValue) => handleFieldChange(fieldId, newValue || undefined)}
                    />
                );

            case FieldType.MULTIPLE_ATTACHMENTS:
                return (
                    <AttachmentField
                        field={field}
                        value={value || []}
                        onChange={(newValue) => handleFieldChange(fieldId, newValue)}
                    />
                );

            case FieldType.DURATION:
                return (
                    <Box display="flex" flexDirection="column" gap={1}>
                        <Input
                            type="number"
                            value={value ? value / 3600 : ''}
                            onChange={(e) => {
                                const hours = parseFloat(e.target.value);
                                handleFieldChange(fieldId, hours ? hours * 3600 : undefined);
                            }}
                            placeholder="Enter hours"
                            step="0.5"
                        />
                        <Text size="xsmall" textColor="light">
                            Enter duration in hours
                        </Text>
                    </Box>
                );

            case FieldType.BARCODE:
                return (
                    <Input
                        value={value?.text || ''}
                        onChange={(e) => handleFieldChange(fieldId, e.target.value ? { text: e.target.value } : undefined)}
                        placeholder="Enter barcode value"
                    />
                );

            default:
                return (
                    <Text size="small" textColor="light">
                        {fieldType} fields are not yet supported
                    </Text>
                );
        }
    };

    const renderNewRecordModal = () => {
        if (!showNewRecordModal) return null;

        const linkedTable = base.getTableByIdIfExists(showNewRecordModal.linkedTableId);
        if (!linkedTable) return null;

        const linkedWritableFields = linkedTable.fields.filter(
            field => !field.isComputed &&
                    field.type !== FieldType.AUTO_NUMBER &&
                    field.type !== FieldType.MULTIPLE_RECORD_LINKS // Avoid recursive linked records
        );

        return (
            <Box
                position="absolute"
                top={0}
                bottom={0}
                left={0}
                right={0}
                backgroundColor="white"
                padding={3}
                overflow="auto"
                zIndex={10}
            >
                <Box display="flex" alignItems="center" justifyContent="space-between" marginBottom={3}>
                    <Heading size="small">
                        Create in {linkedTable.name}
                    </Heading>
                    <Button
                        onClick={() => setShowNewRecordModal(null)}
                        icon="x"
                        variant="secondary"
                        aria-label="Close"
                    />
                </Box>

                {linkedWritableFields.map(field => (
                    <FormField key={field.id} label={field.name} marginBottom={2}>
                        {renderLinkedRecordFieldInput(field)}
                    </FormField>
                ))}

                <Box display="flex" gap={2} marginTop={3}>
                    <Button onClick={submitNewLinkedRecord} variant="primary" icon="check">
                        Create
                    </Button>
                    <Button onClick={() => setShowNewRecordModal(null)} variant="secondary">
                        Cancel
                    </Button>
                </Box>
            </Box>
        );
    };

    const renderLinkedRecordFieldInput = (field: Field) => {
        const fieldId = field.id;
        const fieldType = field.type;
        const value = newRecordData[fieldId];

        switch (fieldType) {
            case FieldType.SINGLE_LINE_TEXT:
            case FieldType.MULTILINE_TEXT:
            case FieldType.EMAIL:
            case FieldType.URL:
            case FieldType.PHONE_NUMBER:
                return (
                    <Input
                        value={value || ''}
                        onChange={(e) => setNewRecordData(prev => ({ ...prev, [fieldId]: e.target.value || undefined }))}
                        placeholder={`Enter ${field.name.toLowerCase()}`}
                    />
                );

            case FieldType.DATE:
                return (
                    <Input
                        type="date"
                        value={value || ''}
                        onChange={(e) => setNewRecordData(prev => ({ ...prev, [fieldId]: e.target.value || undefined }))}
                    />
                );

            case FieldType.DATE_TIME:
                return (
                    <Input
                        type="datetime-local"
                        value={value || ''}
                        onChange={(e) => {
                            const isoDate = e.target.value ? new Date(e.target.value).toISOString() : undefined;
                            setNewRecordData(prev => ({ ...prev, [fieldId]: isoDate }));
                        }}
                    />
                );

            case FieldType.NUMBER:
            case FieldType.CURRENCY:
            case FieldType.PERCENT:
                return (
                    <Input
                        type="number"
                        value={value ?? ''}
                        onChange={(e) => setNewRecordData(prev => ({
                            ...prev,
                            [fieldId]: e.target.value ? parseFloat(e.target.value) : undefined
                        }))}
                    />
                );

            case FieldType.CHECKBOX:
                return (
                    <input
                        type="checkbox"
                        checked={value || false}
                        onChange={(e) => setNewRecordData(prev => ({ ...prev, [fieldId]: e.target.checked }))}
                        style={{ width: '20px', height: '20px' }}
                    />
                );

            case FieldType.SINGLE_SELECT:
                const options = (field.options?.choices as Array<{ name: string }>) || [];
                return (
                    <Select
                        value={value?.name || ''}
                        onChange={(selectedValue) => setNewRecordData(prev => ({
                            ...prev,
                            [fieldId]: selectedValue ? { name: selectedValue } : undefined
                        }))}
                        options={[
                            { value: '', label: 'Select...' },
                            ...options.map((choice) => ({
                                value: choice.name,
                                label: choice.name
                            }))
                        ]}
                    />
                );

            default:
                return (
                    <Text size="small" textColor="light">
                        {fieldType} not supported in quick create
                    </Text>
                );
        }
    };

    // Count filled fields
    const filledFieldCount = Object.values(fieldValues).filter(v =>
        v !== undefined && v !== '' && v !== null &&
        !(Array.isArray(v) && v.length === 0)
    ).length;

    return (
        <Box padding={3} position="relative" height="100vh" overflow="auto">
            {/* Header */}
            <Box marginBottom={3}>
                <Heading size="large">
                    <span role="img" aria-label="clip">📎</span> Enhanced Web Clipper
                </Heading>
                <Text textColor="light">
                    Create records with dates, linked records, and attachments
                </Text>
            </Box>

            {/* Table Selector */}
            <FormField label="Select Table" marginBottom={3}>
                <TablePickerSynced globalConfigKey="selectedTableId" />
            </FormField>

            {/* Fields */}
            {table && (
                <>
                    <Box
                        marginBottom={2}
                        padding={2}
                        backgroundColor="lightGray1"
                        borderRadius="default"
                    >
                        <Text size="small" textColor="light">
                            {writableFields.length} editable fields • {filledFieldCount} filled
                        </Text>
                    </Box>

                    {writableFields.map(field => (
                        <FormField
                            key={field.id}
                            label={
                                <Box display="flex" alignItems="center" gap={1}>
                                    <Text fontWeight="strong">{field.name}</Text>
                                    <Text size="xsmall" textColor="light">
                                        ({field.type.replace('_', ' ')})
                                    </Text>
                                </Box>
                            }
                            marginBottom={3}
                        >
                            {renderFieldInput(field)}
                        </FormField>
                    ))}

                    {/* Submit Button */}
                    <Box
                        display="flex"
                        gap={2}
                        marginTop={4}
                        paddingTop={3}
                        borderTop="thick"
                    >
                        <Button
                            onClick={handleSubmit}
                            disabled={isSubmitting || filledFieldCount === 0}
                            variant="primary"
                            size="large"
                            icon={isSubmitting ? undefined : 'check'}
                            flex="1"
                        >
                            {isSubmitting ? (
                                <Box display="flex" alignItems="center" gap={2}>
                                    <Loader scale={0.3} />
                                    <span>Creating...</span>
                                </Box>
                            ) : (
                                'Create Record'
                            )}
                        </Button>

                        {filledFieldCount > 0 && (
                            <Button
                                onClick={() => setFieldValues({})}
                                variant="secondary"
                                icon="redo"
                                disabled={isSubmitting}
                            >
                                Clear
                            </Button>
                        )}
                    </Box>
                </>
            )}

            {/* Empty State */}
            {!table && (
                <Box
                    display="flex"
                    flexDirection="column"
                    alignItems="center"
                    justifyContent="center"
                    height="200px"
                    border="default"
                    borderRadius="default"
                    backgroundColor="lightGray1"
                >
                    <Icon name="table" size={32} marginBottom={2} />
                    <Text textColor="light">Select a table to get started</Text>
                </Box>
            )}

            {/* New Record Modal */}
            {renderNewRecordModal()}

            {/* Toast Notification */}
            {toast && (
                <Toast
                    message={toast.message}
                    type={toast.type}
                    onClose={() => setToast(null)}
                />
            )}

            {/* CSS Animation for Toast */}
            <style>{`
                @keyframes slideIn {
                    from { transform: translateX(100%); opacity: 0; }
                    to { transform: translateX(0); opacity: 1; }
                }
            `}</style>
        </Box>
    );
}

initializeBlock(() => <EnhancedWebClipperExtension />);
