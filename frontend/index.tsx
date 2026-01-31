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
    FieldPickerSynced,
    colors,
    Icon,
} from '@airtable/blocks/ui';
import React, { useState, useEffect } from 'react';
import { FieldType } from '@airtable/blocks/models';

function EnhancedWebClipperExtension() {
    const base = useBase();
    const globalConfig = useGlobalConfig();

    const tableId = globalConfig.get('selectedTableId') as string | undefined;
    const table = tableId ? base.getTableByIdIfExists(tableId) : null;

    const [url, setUrl] = useState('');
    const [title, setTitle] = useState('');
    const [notes, setNotes] = useState('');
    const [fieldValues, setFieldValues] = useState<Record<string, any>>({});
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [showNewRecordModal, setShowNewRecordModal] = useState<{
        fieldId: string;
        linkedTableId: string;
    } | null>(null);
    const [newRecordData, setNewRecordData] = useState<Record<string, any>>({});

    // Auto-detect URL and title from clipboard or browser context
    useEffect(() => {
        // In a real extension, you'd integrate with browser APIs
        // For now, this is a placeholder for clipboard integration
    }, []);

    const handleFieldChange = (fieldId: string, value: any) => {
        setFieldValues(prev => ({
            ...prev,
            [fieldId]: value
        }));
    };

    const handleCreateLinkedRecord = async (fieldId: string, linkedTableId: string) => {
        setShowNewRecordModal({ fieldId, linkedTableId });
        setNewRecordData({});
    };

    const submitNewLinkedRecord = async () => {
        if (!showNewRecordModal) return;

        const linkedTable = base.getTableByIdIfExists(showNewRecordModal.linkedTableId);
        if (!linkedTable) return;

        try {
            // Create the new record in the linked table
            const recordId = await linkedTable.createRecordAsync(newRecordData);

            // Add the new record to the field values
            const currentValue = fieldValues[showNewRecordModal.fieldId] || [];
            handleFieldChange(showNewRecordModal.fieldId, [...currentValue, { id: recordId }]);

            // Close modal
            setShowNewRecordModal(null);
            setNewRecordData({});
        } catch (error) {
            console.error('Error creating linked record:', error);
            alert('Failed to create linked record. Please try again.');
        }
    };

    const handleSubmit = async () => {
        if (!table) {
            alert('Please select a table first');
            return;
        }

        setIsSubmitting(true);

        try {
            const fields: Record<string, any> = { ...fieldValues };

            await table.createRecordAsync(fields);

            // Reset form
            setUrl('');
            setTitle('');
            setNotes('');
            setFieldValues({});

            alert('Record created successfully!');
        } catch (error) {
            console.error('Error creating record:', error);
            alert('Failed to create record. Please check your field values.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const renderFieldInput = (field: any) => {
        const fieldId = field.id;
        const fieldType = field.type;

        switch (fieldType) {
            case FieldType.SINGLE_LINE_TEXT:
            case FieldType.MULTILINE_TEXT:
            case FieldType.EMAIL:
            case FieldType.URL:
            case FieldType.PHONE_NUMBER:
                return (
                    <Input
                        value={fieldValues[fieldId] || ''}
                        onChange={(e) => handleFieldChange(fieldId, e.target.value)}
                        placeholder={`Enter ${field.name}`}
                    />
                );

            case FieldType.NUMBER:
            case FieldType.CURRENCY:
            case FieldType.PERCENT:
                return (
                    <Input
                        type="number"
                        value={fieldValues[fieldId] || ''}
                        onChange={(e) => handleFieldChange(fieldId, parseFloat(e.target.value) || 0)}
                        placeholder={`Enter ${field.name}`}
                    />
                );

            case FieldType.DATE:
            case FieldType.DATE_TIME:
                return (
                    <Box display="flex" flexDirection="column" gap={2}>
                        <Input
                            type="datetime-local"
                            value={fieldValues[fieldId] || ''}
                            onChange={(e) => {
                                const isoDate = new Date(e.target.value).toISOString();
                                handleFieldChange(fieldId, isoDate);
                            }}
                            placeholder="Select date and time"
                        />
                        <Text size="small" textColor="light">
                            Enhanced: Date field support added!
                        </Text>
                    </Box>
                );

            case FieldType.CHECKBOX:
                return (
                    <input
                        type="checkbox"
                        checked={fieldValues[fieldId] || false}
                        onChange={(e) => handleFieldChange(fieldId, e.target.checked)}
                    />
                );

            case FieldType.SINGLE_SELECT:
                const singleSelectOptions = field.options?.choices || [];
                return (
                    <Select
                        value={fieldValues[fieldId] || ''}
                        onChange={(value) => handleFieldChange(fieldId, value ? { name: value } : null)}
                        options={[
                            { value: '', label: 'Select an option' },
                            ...singleSelectOptions.map((choice: any) => ({
                                value: choice.name,
                                label: choice.name
                            }))
                        ]}
                    />
                );

            case FieldType.MULTIPLE_SELECTS:
                const multiSelectOptions = field.options?.choices || [];
                return (
                    <Box>
                        <Text size="small" marginBottom={1}>
                            Select multiple (comma-separated)
                        </Text>
                        <Input
                            value={
                                fieldValues[fieldId]
                                    ? fieldValues[fieldId].map((item: any) => item.name).join(', ')
                                    : ''
                            }
                            onChange={(e) => {
                                const values = e.target.value
                                    .split(',')
                                    .map((v: string) => v.trim())
                                    .filter((v: string) => v)
                                    .map((v: string) => ({ name: v }));
                                handleFieldChange(fieldId, values);
                            }}
                            placeholder="Enter values separated by commas"
                        />
                    </Box>
                );

            case FieldType.MULTIPLE_RECORD_LINKS:
                const linkedTableId = field.options?.linkedTableId;
                const linkedTable = linkedTableId ? base.getTableByIdIfExists(linkedTableId) : null;
                const linkedRecords = linkedTable ? useRecords(linkedTable) : [];

                return (
                    <Box display="flex" flexDirection="column" gap={2}>
                        <Select
                            value=""
                            onChange={(value) => {
                                if (value) {
                                    const currentValue = fieldValues[fieldId] || [];
                                    handleFieldChange(fieldId, [...currentValue, { id: value }]);
                                }
                            }}
                            options={[
                                { value: '', label: 'Select existing record' },
                                ...linkedRecords.map((record) => ({
                                    value: record.id,
                                    label: record.name || record.id
                                }))
                            ]}
                        />
                        <Button
                            onClick={() => linkedTableId && handleCreateLinkedRecord(fieldId, linkedTableId)}
                            icon="plus"
                            variant="secondary"
                            size="small"
                        >
                            Create new record in {linkedTable?.name || 'linked table'}
                        </Button>
                        {fieldValues[fieldId] && fieldValues[fieldId].length > 0 && (
                            <Box>
                                <Text size="small" fontWeight="strong">Selected records:</Text>
                                {fieldValues[fieldId].map((item: any, idx: number) => {
                                    const record = linkedRecords.find(r => r.id === item.id);
                                    return (
                                        <Box key={idx} display="flex" alignItems="center" gap={1} marginTop={1}>
                                            <Text size="small">{record?.name || item.id}</Text>
                                            <Button
                                                size="small"
                                                variant="danger"
                                                icon="x"
                                                onClick={() => {
                                                    const newValue = fieldValues[fieldId].filter((_: any, i: number) => i !== idx);
                                                    handleFieldChange(fieldId, newValue);
                                                }}
                                            />
                                        </Box>
                                    );
                                })}
                            </Box>
                        )}
                        <Text size="small" textColor="light">
                            Enhanced: Create new linked records inline!
                        </Text>
                    </Box>
                );

            case FieldType.RATING:
                return (
                    <Input
                        type="number"
                        min={0}
                        max={field.options?.max || 5}
                        value={fieldValues[fieldId] || 0}
                        onChange={(e) => handleFieldChange(fieldId, parseInt(e.target.value) || 0)}
                        placeholder={`Rating (0-${field.options?.max || 5})`}
                    />
                );

            default:
                return (
                    <Text size="small" textColor="light">
                        {fieldType} fields are not yet supported in this version
                    </Text>
                );
        }
    };

    const renderNewRecordModal = () => {
        if (!showNewRecordModal) return null;

        const linkedTable = base.getTableByIdIfExists(showNewRecordModal.linkedTableId);
        if (!linkedTable) return null;

        const writableFields = linkedTable.fields.filter(
            field => field.isComputed === false && field.type !== FieldType.AUTO_NUMBER
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
                <Heading size="small" marginBottom={2}>
                    Create new record in {linkedTable.name}
                </Heading>

                {writableFields.map(field => (
                    <FormField key={field.id} label={field.name} marginBottom={2}>
                        {renderLinkedRecordFieldInput(field)}
                    </FormField>
                ))}

                <Box display="flex" gap={2} marginTop={3}>
                    <Button onClick={submitNewLinkedRecord} variant="primary">
                        Create Record
                    </Button>
                    <Button onClick={() => setShowNewRecordModal(null)} variant="secondary">
                        Cancel
                    </Button>
                </Box>
            </Box>
        );
    };

    const renderLinkedRecordFieldInput = (field: any) => {
        const fieldId = field.id;
        const fieldType = field.type;

        switch (fieldType) {
            case FieldType.SINGLE_LINE_TEXT:
            case FieldType.MULTILINE_TEXT:
            case FieldType.EMAIL:
            case FieldType.URL:
            case FieldType.PHONE_NUMBER:
                return (
                    <Input
                        value={newRecordData[fieldId] || ''}
                        onChange={(e) => setNewRecordData(prev => ({ ...prev, [fieldId]: e.target.value }))}
                        placeholder={`Enter ${field.name}`}
                    />
                );

            case FieldType.DATE:
            case FieldType.DATE_TIME:
                return (
                    <Input
                        type="datetime-local"
                        value={newRecordData[fieldId] || ''}
                        onChange={(e) => {
                            const isoDate = new Date(e.target.value).toISOString();
                            setNewRecordData(prev => ({ ...prev, [fieldId]: isoDate }));
                        }}
                    />
                );

            case FieldType.NUMBER:
                return (
                    <Input
                        type="number"
                        value={newRecordData[fieldId] || ''}
                        onChange={(e) => setNewRecordData(prev => ({ ...prev, [fieldId]: parseFloat(e.target.value) || 0 }))}
                    />
                );

            case FieldType.SINGLE_SELECT:
                const options = field.options?.choices || [];
                return (
                    <Select
                        value={newRecordData[fieldId] || ''}
                        onChange={(value) => setNewRecordData(prev => ({ ...prev, [fieldId]: value ? { name: value } : null }))}
                        options={[
                            { value: '', label: 'Select an option' },
                            ...options.map((choice: any) => ({
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

    return (
        <Box padding={3} position="relative" height="100vh" overflow="auto">
            <Box marginBottom={3}>
                <Heading size="large">Enhanced Web Clipper</Heading>
                <Text size="small" textColor="light">
                    Clip web content with date fields and create linked records inline
                </Text>
            </Box>

            <FormField label="Select Table" marginBottom={3}>
                <TablePickerSynced globalConfigKey="selectedTableId" />
            </FormField>

            {table && (
                <>
                    {table.fields
                        .filter(field => !field.isComputed && field.type !== FieldType.AUTO_NUMBER)
                        .map(field => (
                            <FormField key={field.id} label={field.name} marginBottom={3}>
                                {renderFieldInput(field)}
                            </FormField>
                        ))}

                    <Box display="flex" gap={2} marginTop={3}>
                        <Button
                            onClick={handleSubmit}
                            disabled={isSubmitting}
                            variant="primary"
                            size="large"
                        >
                            {isSubmitting ? 'Creating...' : 'Create Record'}
                        </Button>
                    </Box>
                </>
            )}

            {!table && (
                <Box
                    display="flex"
                    alignItems="center"
                    justifyContent="center"
                    height="200px"
                    border="default"
                    borderRadius="default"
                    backgroundColor="lightGray1"
                >
                    <Text textColor="light">Please select a table to get started</Text>
                </Box>
            )}

            {renderNewRecordModal()}
        </Box>
    );
}

initializeBlock(() => <EnhancedWebClipperExtension />);
