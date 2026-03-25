"use client"

import { Component, type ReactNode } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

export class SectionErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  render() {
    if (this.state.error) {
      return (
        <Card className="border-destructive/50">
          <CardContent className="py-6 text-center">
            <p className="text-sm text-muted-foreground mb-2">
              Failed to load this section.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => this.setState({ error: null })}
            >
              Retry
            </Button>
          </CardContent>
        </Card>
      )
    }

    return this.props.children
  }
}
